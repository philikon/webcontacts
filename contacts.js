/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is WebContacts.
 *
 * The Initial Developer of the Original Code is
 * the Mozila Foundation
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Philipp von Weitershausen <philipp@weitershausen.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

//TODO
//
// - error handling for requests and transaction aborts
// - searching/filtering

const DB_NAME = "contacts";
const DB_VERSION = 1;
const STORE_NAME = "contacts";


/**
 * ContactError
 */

const UNKNOWN_ERROR           = 0;
const INVALID_ARGUMENT_ERROR  = 1;
const TIMEOUT_ERROR           = 2;
const PENDING_OPERATION_ERROR = 3;
const IO_ERROR                = 4;
const NOT_SUPPORTED_ERROR     = 5;
const PERMISSION_DENIED_ERROR = 20;

function ContactError(code) {
  this.code = code;
}
ContactError.prototype = {
  UNKNOWN_ERROR:           UNKNOWN_ERROR,
  INVALID_ARGUMENT_ERROR:  INVALID_ARGUMENT_ERROR,
  TIMEOUT_ERROR:           TIMEOUT_ERROR,
  PENDING_OPERATION_ERROR: PENDING_OPERATION_ERROR,
  IO_ERROR:                IO_ERROR,
  NOT_SUPPORTED_ERROR:     NOT_SUPPORTED_ERROR,
  PERMISSION_DENIED_ERROR: PERMISSION_DENIED_ERROR
};


function debug() {
}


/**
 * Contacts
 */
function Contacts() {
}
Contacts.prototype = {

  /**
   * nsIDOMGlobalPropertyInitializer implementation
   */
  init: function(aWindow) {
    this.window = aWindow;
    //this.window.addEventListener("unload", this, false);
  },


  /**
   * Helpers
   */

  /**
   * Cache the DB here.
   */
  db: null,

  /**
   * Prepare the database. This may include opening the database and upgrading it
   * to the latest schema version.
   * 
   * @return (via callback) a database ready for use.
   */
  ensureDB: function ensureDB(callback) {
    if (this.db) {
      debug("ensureDB: already have a database, returning early.");
      callback(this.db);
      return;
    }

    let self = this;
    function gotDB(db) {
      self.db = db;
      callback(db);
    }

    let indexedDB = this.window.mozIndexedDB;
    let request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = function (event) {
      debug("Opened database:", DB_NAME, DB_VERSION);
      gotDB(event.target.result);
    };
    request.onupgradeneeded = function (event) {
      debug("Database needs upgrade:", DB_NAME,
            event.oldVersion, event.newVersion);
      debug("Correct new database version:", event.newVersion == DB_VERSION);

      let db = event.target.result;
      db.version = DB_VERSION;

      switch (event.oldVersion) {
        case 0:
          debug("New database");
          self.createSchema(db);
          break;

        default:
          debug("No idea what to do with old database version:",
                event.oldVersion);
          event.target.transaction.abort();
          //TODO call callback with error arg, or will the onerror handler take
          // care of that?
          break;
      }
    };
    request.onerror = function (event) {
      debug("Failed to open database:", DB_NAME);
      // TODO call callbcak with error arg
    };
    request.onblocked = function (event) {
      debug("Opening database request is blocked.");
    };
  },

  /**
   * Create the initial database schema.
   */
  createSchema: function createSchema(db) {
    let objectStore = db.createObjectStore(STORE_NAME, {keyPath: "id"});
    objectStore.createIndex("familyName", "name.familyName", { unique: false });
    objectStore.createIndex("givenName", "name.givenName", { unique: false });
    //TODO moar indexes here.
    debug("Created object stores and indexes");
  },

  /**
   * Start a new transaction.
   */
  newTxn: function newTxn(txn_type, callback) {
    this.ensureDB(function (db) {
      debug("Starting new transaction", txn_type);
      let txn = db.transaction([STORE_NAME], txn_type);
      debug("Retrieving object store", STORE_NAME);
      let store = txn.objectStore(STORE_NAME);
      callback(txn, store);
    });
  },


  /**
   * WebContacts API
   */

  find: function find(fields, successCb, failureCb, options) {
    //TODO PENDING_OPERATION_ERROR -- the transactionality of indexedDB should
    // give us this for free
    if (!successCb) {
      throw TypeError("Must provide a success callback.");
    }

    if (!fields.length) {
      if (failureCb) {
        failureCb(new ContactError(INVALID_ARGUMENT_ERROR));
      }
      return;
    }

    this.newTxn(IDBTransaction.READ_ONLY, function (txn, store) {
      //TODO handle `options`
      let results = [];
      store.openCursor().onsuccess = function (event) {
        let cursor = event.target.result;
        if (!cursor) {
          debug("Empty cursor, must have fetched all results.");
          return;
        }
        //TODO handle `fields` -- via proxy perhaps?
        results.push(cursor.value);
        cursor.continue();
      };
      txn.oncomplete = function (event) {
        successCb(results);
      };
    });
  },

  create: function create(successCb, errorCb, contact) {
    if (!contact.id) {
      /*
      let uuidGenerator = Cc["@mozilla.org/uuid-generator;1"]
                            .getService(Ci.nsIUUIDGenerator);
      contact.id = uuidGenerator.generateUUID().toString();
      */
      contact.id = generateUUID();
    }
    //TODO ensure the contact has at minimum fields (id, what else?)
    //TODO ensure default values exist
    this.newTxn(IDBTransaction.READ_WRITE, function (txn, store) {
      let result;
      store.put(contact).onsuccess = function (event) {
        let id = event.target.result;
        store.get(id).onsuccess = function (event) {
          result = event.target.result;
        };
      };
      txn.oncomplete = function (event) {
        successCb(result);
      };
    });
  },

  update: function update(successCb, errorCb, contact) {
    this.newTxn(IDBTransaction.READ_WRITE, function (txn, store) {
      store.put(contact);
      txn.oncomplete = function (event) {
        successCb();
      };
    });
  },

  delete: function delete_(successCb, errorCb, id) {
    this.newTxn(IDBTransaction.READ_WRITE, function (txn, store) {
      store.delete(id);
      txn.oncomplete = function (event) {
        successCb();
      };
    });
  }
};


/**
 * Fake setup for HTML
 */

let contacts = window.navigator.mozContacts = new Contacts();
contacts.init(window);

function debug() {
  console.log.apply(console, arguments);
}

/**
 * Generate a UUID according to RFC4122 v4 (random UUIDs)
 */
function generateUUID() {
  var chars = '0123456789abcdef';
  var uuid = [];
  var choice;

  uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
  uuid[14] = '4';

  for (var i = 0; i < 36; i++) {
    if (uuid[i]) {
      continue;
    }
    choice = Math.floor(Math.random() * 16);
    // Set bits 6 and 7 of clock_seq_hi to 0 and 1, respectively.
    // (cf. RFC4122 section 4.4)
    uuid[i] = chars[(i == 19) ? (choice & 3) | 8 : choice];
  }

  return uuid.join('');
};
