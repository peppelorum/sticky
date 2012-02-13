/**
 * Sticky
 *
 * Version 2.1
 * Copyright 2011 Alexander C. Mingoia
 * MIT Licensed
 *
 * Sticky is a simple, key/value pair browser-storage cache leveraging the latest HTML5 storage API's.
 * Sticky persists in your preferred order to one of indexedDB, webSQL, localStorage, globalStorage, or cookies.
 *
 * IndexedDB
 *     IE 10+, FireFox 4+, and Chrome 11+
 * WebSQL (SQLite)
 *     Chrome 4+, Opera 10.5+, Safari 3.1+, and Android Browser 2.1+
 *     5MB of data per DB, but can request more
 * localStorage
 *     Safari 4+, Mobile Safari (iPhone/iPad), Firefox 3.5+, Internet Explorer 8+ and Chrome 4+
 *     5MB of data per domain
 * globalStorage
 *     FireFox 2-3
 * Cookies
 *     4KB+ depending on character encoding and implementation.
 *
 * For more compatibility information, see: http://caniuse.com/
 */


/**
 * Constructor
 *
 * @param {Map} options Options:
 *    var options = {
 *      name: 'Sticky', // Store name. Used to keep multiple stores.
 *      adapters: ['localStorage', 'indexedDB', 'webSQL', 'cookie'], // Storage adapters to use
 *      expires: (24*60*60*1000), // Cookie expiration in milliseconds
 *      ready: function() {}, // Fires after asynchronous connection to db is complete
 *      size: 10 // WebSQL database size in megabytes
 *    };
 *
 *  @return {StickyStore} Returns an instantiated store object.
 */

function StickyStore(options) {
  var store = this;

  // Default options
  var defaults = {
    name: 'Sticky',
    adapters: ['localStorage', 'indexedDB', 'webSQL', 'cookie'],
    expires: (24*60*60*1000),
    size: 5
  };

  // Populate missing options with defaults
  if (options) {
    for (var key in defaults) {
      if (!options[key]) {
        options[key] = defaults[key];
      }
    }
  }
  else {
    options = defaults;
  }

  store.options = options;

  // Register ready callback
  if (options.ready) {
    if (typeof options.ready !== 'function') {
      throw new Error('options.ready callback must be a function');
    }
    store.on('ready', options.ready);
  }

  // Sanitize name
  if (options.name) {
    var regexp = new RegExp('/\W/', 'i');
    if (regexp.test(options.name)) {
      throw new Error('options.name can only contain A-z, 0-9, and underscores.');
    }
  }

  /**
   * Callback for adapter initialization methods.
   * Executes next preferred adapter's initialization method,
   * adding successfully initialized adapters to the
   * `StickyStore._adaptersReady` array.
   *
   * @param String adapter
   */
  var isReady = (function(adapter, ready) {
    var adapterOptsIdx;
    for (var i=0; i<this.options.adapters.length; i++) {
      if (this.options.adapters[i] === adapter) {
        adapterOptsIdx = i + 1;
      }
    }
    if (ready) {
      this.connected.push(adapter);
      this.adapters[adapter].index = this.connected.length - 1;
      if (this.connected.length > 0) {
        this.trigger('ready', this);
      }
    }
    if (adapterOptsIdx && this.adapters[this.options.adapters[adapterOptsIdx]]) {
      this.adapters[this.options.adapters[adapterOptsIdx]].init.call(this, isReady);
    }
  });

  // Initialize adapters
  store.connected = [];
  store.adapters[options.adapters[0]].init.call(store, isReady);
};


/**
 * Subscribe to an event
 *
 * @param String event
 * @param Function fn
 */

StickyStore.prototype.on = (function(event, fn) {
  this.events = this.events || {};
  if (this.events[event]) {
    this.events[event].push(fn);
  }
  else {
    this.events[event] = [fn];
  }
});


/**
 * Trigger an event
 *
 * Any arguments passed after `event` are
 * passed to functions bound to the event.
 *
 * @param String event
 * @param Mixed args
 */

StickyStore.prototype.trigger = (function(event, args) {
  args = Array.prototype.slice.call(arguments, 1);
  if (this.events && this.events[event]) {
    for (var i=0; i<this.events[event].length; i++) {
      this.events[event][i].apply(this, args);
    }
  }
});


/**
 * Exec
 *
 * Executes an adapter operation (get/set/remove/removeAll).
 *
 * @param String op
 * @param String key
 * @param Mixed callback
 * @param String adapter
 *
 * @return Mixed
 */

StickyStore.prototype.exec = (function(op, key, item, callback, adapter) {
  var store = this;
  var nextAdapter;
  var asyncHandler;

  if (typeof callback === 'string') {
    adapter = callback;
    callback = null;
  }

  if (typeof adapter === 'undefined') {
    adapter = store.connected[0];
  }

  if (typeof store.adapters[adapter].index === 'number') {
    nextAdapter = store.connected[store.adapters[adapter].index + 1];
  }

  var async = (adapter === 'indexedDB' || adapter === 'webSQL') ? true : false;

  if (async === true) {
    // This handles the callback for asynchronous
    // adapters, and determines if trying the next
    // preferred adapter is necessary.
    asyncHandler = function(result) {
      if (result === false && typeof nextAdapter === 'string') {
        if (op === 'set') {
          return store.set.call(store, key, item, callback, nextAdapter);
        }
        return store[op].call(store, key, callback, nextAdapter);
      }
      callback && callback.call(store, result);
      store.trigger(op, key, result);
    };
  }

  var result;
  if (store.adapters[adapter].io) {
    if (async) {
      if (op === 'set') {
        return store.adapters[adapter].set.call(store, key, item, asyncHandler);
      }
      return store.adapters[adapter][op].call(store, key, asyncHandler);
    }
    if (op === 'set') {
      result = store.adapters[adapter].set.call(store, key, item);
    }
    else {
      result = store.adapters[adapter][op].call(store, key, item);
    }
  }
  if (result === false && typeof nextAdapter === 'string') {
    if (op === 'set') {
      return store.set.call(store, key, item. callback, nextAdapter);
    }
    return store[op].call(store, key, callback, nextAdapter);
  }
  store.trigger(op, key, result);
  callback && callback.call(store, result);
  return result;
});


/**
 * Get
 *
 * @param String key
 * @param Function callback Optional. Called after async operations are completed
 * with the stored item or false as the first argument.
 * @param String adapter The adapter to use.
 *
 * @return Mixed Returns value stored or false.
 */

StickyStore.prototype.get = (function(key, callback, adapter) {
  return this.exec.call(this, 'get', key, null, callback, adapter);
});


/**
 * Set
 *
 * @param String key
 * @param Mixed item
 * @param Function callback Optional. Called after async operations are completed
 * with the stored item or false as the first argument.
 * @param String adapter The adapter to use.
 *
 * @return Mixed Returns value stored or false if attempt to store failed.
 */

StickyStore.prototype.set = (function(key, item, callback, adapter) {
  return this.exec.call(this, 'set', key, item, callback, adapter);
});


/**
 * Remove
 *
 * @param String key
 * @param Function callback Optional. Executed after async operations are complete
 * Callback's first argument is a bolean of whether the operation was successful or not.
 * @param String adapter The adapter to use.
 *
 * @param Bolean
 */

StickyStore.prototype.remove = (function(key, callback, adapter) {
  var asyncHandler;
  if (callback) {
    var store = this;
    var results = 0;
    asyncHandler = function(result) {
      results++;
      if (results === store.connected.length) {
        callback.call(store, true);
        store.trigger('remove', key);
      }
    };
  }
  for (var i=1; i<this.connected.length; i++) {
    this.adapters[this.connected[i]].remove.call(this, key, asyncHandler);
  }
  return this.exec.call(this, 'remove', key);
});


/**
 * Remove All
 *
 * @param Function callback
 *
 * Removes all values in this store from all storage mechanisms
 */

StickyStore.prototype.removeAll = (function(callback) {
  var asyncHandler;
  if (callback) {
    var store = this;
    var results = 0;
    asyncHandler = function(result) {
      results++;
      if (results === store.connected.length) {
        callback.call(store, true);
        store.trigger('removeAll');
      }
    };
  }
  for (var i=0; i<this.connected.length; i++) {
    this.adapters[this.connected[i]].removeAll.call(this, asyncHandler);
  }
});


/**
 * Adapters
 */

StickyStore.prototype.adapters = {'indexedDB':{}, 'webSQL':{}, 'localStorage':{}, 'cookie':{}};


/**
 * IndexedDB: Initialize
 *
 * @param Function callback
 */

StickyStore.prototype.adapters.indexedDB.init = (function(callback) {
  var store = this;

  // backwards compatibility
  if ('mozIndexedDB' in window) {
     window.indexedDB = window.mozIndexedDB;
  }

  // Method to create objectStore
  var createObjectStore = function(event) {
    if (!store.adapters.indexedDB.io.objectStoreNames.contains(store.options.name)) {
      store.adapters.indexedDB.io.createObjectStore(store.options.name, {keyPath: 'key'});
    }
    callback && callback.call(store, 'indexedDB', true);
  };

  if (window.indexedDB) {
    // Request to open database
    var request = window.indexedDB.open('Sticky', 20);

    request.onsuccess = function(event) {
      store.adapters.indexedDB.io = event.target.result
      // Backwards compatibility for older indexedDB implementations before
      // IDBDatabase.setVersion() was removed.
      if (event.target.result.setVersion && event.target.result.version !== '2.0') {
        var request = store.adapters.indexedDB.io.setVersion('2.0');
        request.onsuccess = createObjectStore;
        request.onerror = function(event) {
          callback && callback.call(store, 'indexedDB', false);
          store.trigger('error', "Couldn't change indexedDB version (Code " + request.errorCode + ")");
        };
      }
      else {
        createObjectStore();
      }
    };

    request.onupdateneeded = createObjectStore;

    request.onerror = function(event) {
      callback && callback.call(store, 'indexedDB', false);
      store.trigger('error', "Couldn't open indexedDB (Code " + request.errorCode + ")");
    };
  }
  else {
    callback && callback.call(store, 'indexedDB', false);
  }
});


/**
 * IndexedDB: Get
 *
 * @param String key
 * @param Mixed callback The callbacks first argument is the item or
 * false depending on the operation's success.
 */

StickyStore.prototype.adapters.indexedDB.get = (function(key, callback) {
  var store = this;
  var tx = store.adapters.indexedDB.io.transaction([store.options.name], IDBTransaction.READ_ONLY);
  var objStore = tx.objectStore(store.options.name);
  var request = objStore.get(key);
  var item = false;
  request.onsuccess = function(event) {
    if (event.target.result) {
      item = store.unserialize(event.target.result.data);
    }
    callback && callback.call(store, item);
  };
  request.onerror = function(event) {
    store.trigger('error', "Couldn't get item from indexedDB objectStore (Code " + request.errorCode + ")");
    callback && callback.call(store, false);
  };
});


/**
 * IndexedDB: Set
 *
 * @param String key
 * @param Mixed value
 * @param Function callback Optional. Called after async operations are completed
 * with false as the first argument if operation failed or the item stored if successful.
 *
 * @return Mixed Returns item to be stored.
 */

StickyStore.prototype.adapters.indexedDB.set = (function(key, item, callback) {
  var store = this;
  var value = this.serialize(item);
  var tx = store.adapters.indexedDB.io.transaction([store.options.name], IDBTransaction.READ_WRITE);
  var objStore = tx.objectStore(store.options.name);
  var request = objStore.put({'key': key, 'data': value});
  request.onsuccess = function(e) {
    callback && callback.call(store, item);
  };
  request.onerror = function(e) {
    store.trigger('error', 'Failed to store item in indexedDB (Code: ' + e.target.errorCode + ')', item);
    callback && callback.call(store, false);
  };
  return item;
});


/**
 * IndexedDB: Remove
 *
 * @param String key
 * @param Function callback
 */

StickyStore.prototype.adapters.indexedDB.remove = (function(key, callback) {
  var store = this;
  var tx = store.adapters.indexedDB.io.transaction([store.options.name], IDBTransaction.READ_WRITE);
  var objStore = tx.objectStore(store.options.name);
  var request = objStore['delete'](key);
  request.onsuccess = function(e) {
    callback && callback.call(store, true);
  };
  request.onerror = function(e) {
    store.trigger('error', 'Error removing item from indexedDB', key);
    callback && callback.call(store, false);
  };
});


/**
 * IndexedDB: Remove All
 *
 * @param Function callback
 */

StickyStore.prototype.adapters.indexedDB.removeAll = (function(callback) {
  var store = this;
  var tx = store.adapters.indexedDB.io.transaction([store.options.name], IDBTransaction.READ_WRITE);
  var objStore = tx.objectStore(store.options.name);
  var request = objStore.clear();
  request.onsuccess = function(e) {
    callback && callback.call(store, true);
  };
  request.onerror = function(e) {
    store.trigger('error', 'Error clearing indexedDB objectStore', err);
    callback && callback.call(store, false);
  };
});


/**
 * webSQL: Initialize
 *
 * @param Function callback
 */

StickyStore.prototype.adapters.webSQL.init = (function(callback) {
  var store = this;
  try {
    store.adapters.webSQL.io = window.openDatabase(
      'Sticky',
      '2.0',
      'Sticky Offline Web Cache',
      (store.options.size * 1024 * 1024)
    );
    if (store.adapters.webSQL.io) {
      store.adapters.webSQL.io.transaction(function(tx) {
        tx.executeSql('CREATE TABLE IF NOT EXISTS ' + store.options.name + ' (key TEXT, data TEXT)');
        callback && callback.call(store, 'webSQL', true);
      });
    }
  }
  catch (err) {
    callback && callback.call(store, 'webSQL', false);
    store.trigger('error', err);
  }
});


/**
 * webSQL: Get
 *
 * @param String key
 * @param Mixed callback The callbacks first argument is the item or
 * false depending on the operation's success.
 */

StickyStore.prototype.adapters.webSQL.get = (function(key, callback) {
  var store = this;
  var item;
  store.adapters.webSQL.io.transaction(function(tx) {
    tx.executeSql('SELECT * FROM ' + store.options.name + ' WHERE key=?', [key], function(tx, results) {
      if (results.rows.length === 1) {
        var record = results.rows.item(0);
        item = store.unserialize(record['data']);
        callback && callback.call(store, item);
      }
      else {
        store.trigger('error', "Couldn't get webSQL webSQL item with key: " + key, key);
        callback && callback.call(store, false);
      }
    });
  });
});


/**
 * WebSQL: Set
 *
 * @param String key
 * @param Mixed value
 * @param Function callback Optional. Called after async operations are completed
 * with false as the first argument if operation failed or the item stored if successful.
 *
 * @return Mixed Returns item to be stored.
 */

StickyStore.prototype.adapters.webSQL.set = (function(key, item, callback) {
  var store = this;
  var value = this.serialize(item);
  var insert = function(tx, result) {
    // If update failed then insert
    if (result && result.rowsAffected === 0) {
      tx.executeSql('INSERT INTO ' + store.options.name + ' (key, data) VALUES (?, ?)', [key, value], function(tx, result) {
        if (result && result.rowsAffected === 0) {
          store.trigger('error', 'Failed to insert webSQL item', item);
          callback && callback.call(store, false);
        }
        else {
          callback && callback.call(store, item);
        }
      });
    }
    else {
      callback && callback.call(store, item);
    }
  }
  // Update, and pass insert as callback
  var update = function(tx) {
    tx.executeSql('UPDATE ' + store.options.name + ' SET data=? WHERE key=?', [value, key], insert);
  }
  store.adapters.webSQL.io.transaction(update);
  return item;
});


/**
 * WebSQL: Remove
 *
 * @param String key
 * @param Function callback
 */

StickyStore.prototype.adapters.webSQL.remove = (function(key, callback) {
  var store = this;
  store.adapters.webSQL.io.transaction(function(tx) {
    tx.executeSql('DELETE FROM ' + store.options.name + ' WHERE key=?', [key], function(tx, result) {;
      if (result && result.rowsAffected === 0) {
        callback && callback.call(store, false);
        store.trigger('error', 'Failed to delete webSQL item', key);
      }
      else {
        callback && callback.call(store, true);
      }
    });
  });
});


/**
 * WebSQL: Remove All
 *
 * @param Function callback
 */

StickyStore.prototype.adapters.webSQL.removeAll = (function(callback) {
  var store = this;
  store.adapters.webSQL.io.transaction(function(tx) {
    tx.executeSql(
      'DROP TABLE ' + store.options.name,
      [],
      function(tx) {;
        callback && callback.call(store, true);
      },
      function(tx, error) {
        callback && callback.call(store, false);
        store.trigger('error', 'Failed to remove all webSQL items', error.message);
      }
    );
  });
});


/**
 * localStorage: Initialize
 *
 * @param Function callback
 */

StickyStore.prototype.adapters.localStorage.init = (function(callback) {
  if (window.localStorage) {
    this.adapters.localStorage.io = localStorage;
    callback && callback.call(this, 'localStorage', true);
  }
  else if (window.globalStorage) {
    this.adapters.localStorage.io = globalStorage[this.options.domain];
    callback && callback.call(this, 'localStorage', true);
  }
  else {
    callback && callback.call(this, 'localStorage', false);
  }
});


/**
 * localStorage: Get
 *
 * @param String key
 * @param Mixed callback The callbacks first argument is the item or
 * false depending on the operation's success.
 *
 * @return Mixed Returns item stored or false.
 */

StickyStore.prototype.adapters.localStorage.get = (function(key, callback) {
  var item;

  try {
    item = this.adapters.localStorage.io.getItem(this.options.name + '_' + key);
  }
  catch (err) {
    this.trigger('error', err);
  }
  if (item) {
    callback && callback.call(this, this.unserialize(item));
    return item;
  }
  else {
    callback && callback.call(this, false);
    return false;
  }
});


/**
 * localStorage: Set
 *
 * @param String key
 * @param Mixed value
 * @param Function callback Optional. Called after async operations are completed
 * with false as the first argument if operation failed or the item stored if successful.
 *
 * @return Mixed Returns item to be stored or false.
 */

StickyStore.prototype.adapters.localStorage.set = (function(key, item, callback) {
  var value = this.serialize(item);
  try {
    this.adapters.localStorage.io.setItem(this.options.name + '_' + key, value);
    callback && callback.call(this, item);
    return item;
  }
  catch (err) {
    this.trigger('error', err, item);
    callback && callback.call(this, false);
    return false;
  }
});


/**
 * localStorage: Remove
 *
 * @param String key
 * @param Function callback
 *
 * @return Bolean
 */

StickyStore.prototype.adapters.localStorage.remove = (function(key, callback) {
  try {
    this.adapters.localStorage.io.removeItem(this.options.name + '_' + key);
    return true;
  }
  catch (err) {
    this.trigger('error', err, key);
    return false;
  }
});


/**
 * localStorage: Remove All
 *
 * @param Function callback
 *
 * @return Bolean
 */

StickyStore.prototype.adapters.localStorage.removeAll = (function(callback) {
  // Loop through each item in localStorage and remove ones that match
  // this store.
  for (var i=0; i<this.adapters.localStorage.io.length; i++) {
    var key = this.adapters.localStorage.io.key(i);
    if (key.indexOf(this.options.name) === 0) {
      this.adapters.localStorage.io.removeItem(key);
    }
  }
  callback && callback.call(this, true);
  return true;
});


/**
 * Cookie: Initialize
 *
 * @param Function callback
 */

StickyStore.prototype.adapters.cookie.init = (function(callback) {
  if (document.cookie) {
    this.adapters.cookie.io = document.cookie;
    callback && callback.call(this, 'cookie', true);
  }
  else {
    callback && callback.call(this, 'cookie', false);
  }
});


/**
 * Cookie: Get
 *
 * @param String key
 * @param Mixed callback The callbacks first argument is the item or
 * false depending on the operation's success.
 *
 * @return Mixed Returns the item stored or false.
 */

StickyStore.prototype.adapters.cookie.get = (function(key, callback) {
  var item;
  if (key.search(/\W/i) === -1) {
    var keyEquals = this.options.name + '_' + key + '=';
    var cookieArray = this.adapters.cookie.io.split(';');
    for (var i=0; i<cookieArray.length; i++) {
      var cookie = cookieArray[i];
      while (cookie.charAt(0) === ' ') {
        cookie = cookie.substring(1, cookie.length);
      }
      if (cookie.indexOf(keyEquals) === 0) {
        item = this.unserialize(cookie.substring(keyEquals.length, cookie.length));
      }
    }
  }
  else {
    this.trigger('error', 'Key cannot contain special characters when persisting to cookies. Only A-z, 0-9, and _ are allowed.', key);
  }
  if (item) {
    callback && callback.call(this, item);
    return item;
  }
  else {
    callback && callback.call(this, false);
    return false;
  }
});


/**
 * Cookie: Set
 *
 * @param String key
 * @param Mixed value
 * @param Function callback Optional. Called after async operations are completed
 * with false as the first argument if operation failed or the item stored if successful.
 *
 * @return Mixed Returns item to be stored or false.
 */

StickyStore.prototype.adapters.cookie.set = (function(key, item, callback) {
  var value = this.serialize(item);
  if (((value.length + key.length) - 100) > 4000) {
    this.trigger('error', 'Serialized value too large for cookie storage', key);
  }
  else if (key.search(/\W/i) === -1) {
    document.cookie = this.options.name + '_' + key + '=' + value
      + '; expires=' + new Date(new Date().getTime() + this.options.expires).toGMTString()
      + '; path=/';
    callback && callback.call(this, item);
    return item;
  }
  else {
    this.trigger('error', 'Key cannot contain special characters when persisting to cookies. Only A-z, 0-9, and _ are allowed.', key);
  }
  callback && callback.call(this, false);
  return false;
});


/**
 * Cookie: Remove
 *
 * @param String key
 * @param Function callback
 *
 * @return Bolean
 */

StickyStore.prototype.adapters.cookie.remove = (function(key, callback) {
  try {
    document.cookie = this.options.name + '_' + key + '=; expires=-1; path=/';
    callback && callback.call(this, true);
    return true;
  }
  catch (err) {
    this.trigger('error', err, key);
    callback && callback.call(this, false);
    return false;
  }
});


/**
 * Cookie: Remove All
 *
 * @param Function callback
 *
 * @return Bolean
 */

StickyStore.prototype.adapters.cookie.removeAll = (function(callback) {
  var cookies = this.adapters.cookie.io.split(';');
  for (var i=0; i<cookies.length; i++) {
    var key = cookies[i].split('=')[0];
    if (key.indexOf(this.options.name) === 0) {
      this.remove.call(this, key, 'cookie');
    }
  }
  callback && callback.call(this, true);
  return true;
});


/**
 * Serialize item for storage
 *
 * @param {Mixed} item
 * @return {String} returns serialized item
 */

StickyStore.prototype.serialize = (function(item) {
  var itemType = typeof item;
  var serialized;
  // Objects and arrays are stringified
  if (itemType === 'string' && item.length > 0) {
    serialized = item;
  }
  else {
    if (itemType === 'object' || itemType === 'array') {
      try {
        serialized = 'J::O' + JSON.stringify(item);
      }
      catch (err) {
        store.trigger('error', err, item);
      }
    }
    else {
        serialized = item.toString();
    }
  }
  return serialized;
});


/**
 * Unserialize item for storage
 *
 * @param {String} serialized serialized item
 * @return {Mixed} returns item
 */

StickyStore.prototype.unserialize = (function(serialized) {
  var item;
  if (serialized) {
    if (serialized.substr(0, 4) === 'J::O') {
      try {
        item = JSON.parse(serialized.substr(4));
      }
      catch (err) {
        this.trigger('error', err, serialized);
      }
    }
    else {
      item = serialized;
    }
  }
  return item;
});
