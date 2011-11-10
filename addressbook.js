"use strict";

//TODO
// - searching/filtering
// - editing contacts
// - deleting


//XXX this would be l10n'ed
const FIELD_TYPES = {
  home:   "Home",
  mobile: "Mobile",
  work:   "Work",
  other:  "Other"
};

const PLACEHOLDERS = {
  phoneNumbers: "Phone",
  emails:       "Email",
  addresses:    "Address"
};

/**
 * Traverse an object structure by path and set an attribute value.
 * 
 * Example:
 * 
 *   let contact = {names: {}};
 *   setAttrByPath(contact, "names.firstName", "Bob");
 */
function setAttrByPath(obj, path, value) {
  let segments = path.split(".");
  while (segments.length - 1) {
    let attr = segments.shift();
    if (!obj[attr]) {
      obj[attr] = {};
    }
    obj = obj[attr];    
  }
  obj[segments[0]] = value;
}

let AB = {

  init: function init() {
    AB.updateContactListing();
    AB.newSimpleListEntry("phoneNumbers");
    AB.newSimpleListEntry("emails");
    AB.newSimpleListEntry("addresses");
  },

  newContactForm: function newContactForm() {
    document.getElementById("new_contact").style.display = "block";
    return false;
  },

  newSimpleListEntry: function newSimpleListEntry(kind) {
    let fieldset = document.getElementById("fieldset." + kind);
    // This number is kind of arbitrary.
    let new_index = fieldset.childNodes.length - 1;

    let kind_plus_index = kind + "." + new_index;
    let div = document.createElement("div");
    div.id = kind_plus_index;

    let select = document.createElement("select");
    select.id = kind_plus_index + ".type";
    for (let field_type in FIELD_TYPES) {
      let option = document.createElement("option");
      option.value = field_type;
      option.textContent = FIELD_TYPES[field_type];
      select.appendChild(option);
    }
    div.appendChild(select);
    //TODO automatically figure out which one of the types isn't selected yet
    // so we can select one of the other.

    let input = document.createElement("input");
    input.id = kind_plus_index + ".value";
    input.placeholder = PLACEHOLDERS[kind];
    div.appendChild(input);

    let button = document.createElement("button");
    button.setAttribute("onclick", "return AB.removeSimpleListEntry('" +
                                   kind + "', " + new_index + ");");
    button.textContent = "-";
    div.appendChild(button);
    //TODO hide button if it's the last entry

    let addbutton = document.getElementById(kind + ".add");
    fieldset.insertBefore(div, addbutton);
    return false;
  },

  removeSimpleListEntry: function removeMultiListEntry(kind, index) {
    let kind_plus_index = kind + "." + index;
    let div = document.getElementById(kind_plus_index);
    div.parentNode.removeChild(div);
    return false;
  },

  cancelNewContactForm: function cancelNewContactForm() {
    let form = document.getElementById("new_contact");
    form.reset();
    form.style.display = "none";
    return false;
  },

  createNewContact: function createNewContact() {
    let record = {name: {},
                  phoneNumbers: [],
                  emails: [],
                  addresses: [],
                  organizations: [],
                  photos: [],
                  categories: [],
                  urls: []};

    let form = document.getElementById("new_contact");
    let fields = form.elements;
    for (let i = 0; i < fields.length; i++) {
      let field = fields[i];
      if (["fieldset", "button"].indexOf(field.localName) != -1) {
        continue;
      }
      console.log(field.localName + "#" + field.id, "->", field.value);
      if (field.value) {
        setAttrByPath(record, field.id, field.value);
      }
      field.disabled = true;
    }
    //TODO filter arrays

    //TODO this is a locale setting
    record.displayName = record.name.givenName + " " + record.name.familyName;

    console.log("Adding to the addressbook", record);
    window.navigator.mozContacts.create(AB.hideNewContactForm,
                                        AB.displayErrorMsg,
                                        record);
    return false;
  },

  hideNewContactForm: function hideNewContactForm() {
    document.getElementById("errorMsg").textContent = "";

    let form = document.getElementById("new_contact");
    form.style.display = "none";
    form.reset();

    let fields = form.elements;
    for (let i = 0; i < fields.length; i++) {
      let field = fields[i];
      field.disabled = false;
    }

    AB.updateContactListing();
  },

  displayErrorMsg: function displayErrorMsg(error) {
    document.getElementById("errorMsg").textContent =
      "There was an error adding the contact to your addressbook.";

    let form = document.getElementById("new_contact");
    let fields = form.elements;
    for (let i = 0; i < fields.length; i++) {
      let field = fields[i];
      field.disabled = false;
    }    
  },

  updateContactListing: function updateContactListing() {
    window.navigator.mozContacts.find(["id", "displayName"],
                                      AB.displayContactList);
  },

  displayContactList: function displayContactList(contacts) {
    let table = document.getElementById("contactlist");
    while (table.tBodies.length) {
      table.removeChild(table.tBodies[0]);
    }

    let tbody = document.createElement("tbody");
    if (!contacts.length) {
      let tr = document.createElement("tr");
      tbody.appendChild(tr);
      let td = document.createElement("td");
      tr.appendChild(td);
      td.textContent = "";
    }

    for (let i = 0; i < contacts.length; i++) {
      let contact = contacts[i];

      let tr = document.createElement("tr");
      tbody.appendChild(tr);
      let td = document.createElement("td");
      tr.appendChild(td);
      td.textContent = contact.displayName;
      td.id = contact.id;
    }
    table.appendChild(tbody);
  },

};
