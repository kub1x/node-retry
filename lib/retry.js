var debug = require('debug')('retry');
var RetryOperation = require('./retry_operation');

exports.operation = function(options) {
  var timeouts = exports.timeouts(options);
  return new RetryOperation(timeouts, {
      forever: options && options.forever,
      unref: options && options.unref,
      maxRetryTime: options && options.maxRetryTime
  });
};

exports.timeouts = function(options) {
  if (options instanceof Array) {
    return [].concat(options);
  }

  var opts = {
    retries: 10,
    factor: 2,
    minTimeout: 1 * 1000,
    maxTimeout: Infinity,
    randomize: false
  };
  for (var key in options) {
    opts[key] = options[key];
  }

  if (opts.minTimeout > opts.maxTimeout) {
    throw new Error('minTimeout is greater than maxTimeout');
  }

  var timeouts = [];
  for (var i = 0; i < opts.retries; i++) {
    timeouts.push(this.createTimeout(i, opts));
  }

  if (options && options.forever && !timeouts.length) {
    timeouts.push(this.createTimeout(i, opts));
  }

  // sort the array numerically ascending
  timeouts.sort(function(a,b) {
    return a - b;
  });

  return timeouts;
};

exports.createTimeout = function(attempt, opts) {
  var random = (opts.randomize)
    ? (Math.random() + 1)
    : 1;

  var timeout = Math.round(random * opts.minTimeout * Math.pow(opts.factor, attempt));
  timeout = Math.min(timeout, opts.maxTimeout);

  return timeout;
};

function buildWrapper(obj, options, method) {

  return function retryWrapper(original) {
    var op         = exports.operation(options);
    var args       = Array.prototype.slice.call(arguments, 1);
    var callback   = args.pop();

    args.push(function(err) {
      if (op.retry(err)) {
        debug(`retrying: ${method} with error`, err);
        return;
      }
      if (err) {
        debug(`error: ${method}`, err);
        arguments[0] = op.mainError();
      }
      debug(`success: ${method}`);
      callback.apply(this, arguments);
    });

    op.attempt(function() {
      debug(`first attempt: ${method}`);
      original.apply(obj, args);
    });
  }

}

exports.wrap = function(obj, options, methods) {
  if (options instanceof Array) {
    methods = options;
    options = null;
  }

  if (!methods) {
    methods = [];
    for (var key in obj) {
      if (typeof obj[key] === 'function') {
        methods.push(key);
      }
    }
  }

  for (var i = 0; i < methods.length; i++) {
    var method   = methods[i];
    var original = obj[method];
    original.name = method;

    debug(`wrapping method ${method}`);

    obj[method] = buildWrapper(obj, options, method).bind(obj, original);
    obj[method].options = options;
  }
  return obj;
};
