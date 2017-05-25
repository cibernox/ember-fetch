import Ember from 'ember';
import fetch from 'fetch';

const {
  assign,
  merge,
  RSVP
} = Ember;

/**
 * Helper function that turns the data/body of a request into a query param string.
 * This is directly copied from jQuery.param.
 * @param {Object} queryParamsObject
 * @returns {String}
 */
export function serialiazeQueryParams(queryParamsObject) {
  var s = [], rbracket = /\[\]$/;
  function isArray(obj) {
    return Object.prototype.toString.call(obj) === '[object Array]';
  }
  function add(k, v) {
    v = typeof v === 'function' ? v() : v === null ? '' : v === undefined ? '' : v;
    s[s.length] = encodeURIComponent(k) + '=' + encodeURIComponent(v);
  }
  function buildParams(prefix, obj) {
    var i, len, key;

    if (prefix) {
      if (isArray(obj)) {
        for (i = 0, len = obj.length; i < len; i++) {
          if (rbracket.test(prefix)) {
            add(prefix, obj[i]);
          } else {
            buildParams(prefix + '[' + (typeof obj[i] === 'object' ? i : '') + ']', obj[i]);
          }
        }
      } else if (obj && String(obj) === '[object Object]') {
        for (key in obj) {
          buildParams(prefix + '[' + key + ']', obj[key]);
        }
      } else {
        add(prefix, obj);
      }
    } else if (isArray(obj)) {
      for (i = 0, len = obj.length; i < len; i++) {
        add(obj[i].name, obj[i].value);
      }
    } else {
      for (key in obj) {
        buildParams(key, obj[key]);
      }
    }
    return s;
  }

  return buildParams('', queryParamsObject).join('&').replace(/%20/g, '+');
}

/**
 * Helper function to create a plain object from the response's Headers.
 * Consumed by the adapter's `handleResponse`.
 * @param {Headers} headers
 * @returns {Object}
 */
export function headersToObject(headers) {
  let headersObject = {};
  headers.forEach((value, key) => {
    headersObject[key] = value;
  });
  return headersObject;
}
/**
 * Helper function that translates the options passed to `jQuery.ajax` into a format that `fetch` expects.
 * @param {Object} options
 */
export function mungOptionsForFetch(_options) {
  const options = (assign || merge)({
    credentials: 'same-origin',
  }, _options);

  options.method = options.type;

  // Mimics the default behavior in Ember Data's `ajaxOptions`
  if (options.headers && (!options.headers['Content-Type'] || !options.headers['content-type'])) {
    options.headers['Content-Type'] = 'application/json; charset=utf-8';
  }

  // GET and HEAD requests can't have a `body`
  if (options.data && Object.keys(options.data).length) {
    if (options.method === 'GET' || options.method === 'HEAD') {
      options.url += `?${serialiazeQueryParams(options.data)}`;
    } else {
      options.body = options.data;
    }
  }

  return options;
}

export default Ember.Mixin.create({
  /**
   * @param {String} url
   * @param {String} type
   * @param {Object} options
   * @override
   */
  ajax(url, type, options) {
    const requestData = {
      url,
      method: type,
    };

    const hash = this.ajaxOptions(url, type, options);

    return this._ajaxRequest(hash)
      .catch((error, response, requestData) => {
        throw this.ajaxError(error, response, requestData);
      })
      .then((response) => {
        if (response.ok) {
          const bodyPromise = response.json();
          return this.ajaxSuccess(response, bodyPromise, requestData);
        }
        throw this.ajaxError(null, response, requestData);
      });
  },
  /**
   * Overrides the `_ajaxRequest` method to use `fetch` instead of jQuery.ajax
   * @param {Object} options
   * @override
   */
  _ajaxRequest(options) {
    const _options = mungOptionsForFetch(options);

    return fetch(_options.url, _options);
  },

  /**
   * @param {Object} response
   * @param {Promise} bodyPromise
   * @param {Object} requestData
   * @override
   */
  ajaxSuccess(response, bodyPromise, requestData) {
    const headersObject = headersToObject(response.headers);

    return bodyPromise.then((body) => {
      const returnResponse = this.handleResponse(
        response.status,
        headersObject,
        body,
        requestData
      );

      if (returnResponse && returnResponse.isAdapterError) {
        return RSVP.Promise.reject(returnResponse);
      } else {
        return returnResponse;
      }
    });
  },

  /**
   * @param {Error} error
   * @param {Object} response
   * @param {Object} requestData
   */
  ajaxError(error, response, requestData) {
    let returnedError;

    if (error instanceof Error) {
      returnedError = error;
    } else {
      try {
        const headersObject = headersToObject(response.headers);
        returnedError = this.handleResponse(
          response.status,
          headersObject,
          this.parseErrorResponse(response.statusText) || error,
          requestData
        );
      } catch (e) {
        throw e;
      }
    }

    return returnedError;
  }
});