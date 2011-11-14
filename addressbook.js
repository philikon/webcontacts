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
    document.getElementById("newContactButton").disabled = true;

    AB.currentContact = {name: {},
                         phoneNumbers: [],
                         emails: [],
                         addresses: [],
                         organizations: [],
                         photos: [],
                         categories: [],
                         urls: []};

    let table = document.getElementById("contactList");

    let old_row = table.querySelector(".selected");
    if (old_row) {
      old_row.classList.remove("selected");
    }

    let tr = document.createElement("tr");
    tr.id = "newContactRow";
    tr.classList.add("selected");
    let td = document.createElement("td");
    td.textContent = "(New contact)";
    tr.appendChild(td);
    let tbody = table.tBodies[0];
    tbody.insertBefore(tr, tbody.firstChild);

    document.getElementById("contactEdit").style.display = "block";
    document.getElementById("contactView").style.display = "none";
    return false;
  },

  newSimpleListEntry: function newSimpleListEntry(kind) {
    let fieldset = document.getElementById("edit.fieldset." + kind);
    // This number is kind of arbitrary.
    let new_index = fieldset.childNodes.length - 1;

    let kind_plus_index = "edit." + kind + "." + new_index;
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

    let addbutton = document.getElementById("edit." + kind + ".add");
    fieldset.insertBefore(div, addbutton);
    return false;
  },

  removeSimpleListEntry: function removeMultiListEntry(kind, index) {
    let kind_plus_index = "edit." + kind + "." + index;
    let div = document.getElementById(kind_plus_index);
    div.parentNode.removeChild(div);
    return false;
  },

  closeContactEditForm: function closeContactEditForm() {
    document.getElementById("newContactButton").disabled = false;
    document.getElementById("errorMsg").textContent = "";

    let table = document.getElementById("contactList");
    let new_row = table.querySelector("#newContactRow");
    if (new_row) {
      new_row.parentNode.removeChild(new_row);
    }

    let form = document.getElementById("contactEdit");
    form.reset();
    form.style.display = "none";

    let fields = form.elements;
    for (let i = 0; i < fields.length; i++) {
      let field = fields[i];
      field.disabled = false;
    }

    return false;
  },

  cancelNewContact: function cancelNewContact() {
    AB.currentContact = null;
    AB.closeContactEditForm();
    return false;
  },

  createNewContact: function createNewContact() {
    let record = AB.currentContact;

    let form = document.getElementById("contactEdit");
    let fields = form.elements;
    for (let i = 0; i < fields.length; i++) {
      let field = fields[i];
      if (["fieldset", "button"].indexOf(field.localName) != -1) {
        continue;
      }
      let property = field.id.slice("edit.".length);
      console.log(field.localName + "#" + field.id, "->", field.value);
      if (field.value) {
        setAttrByPath(record, property, field.value);
      }
      field.disabled = true;
    }
    //TODO filter arrays

    //TODO this is a locale setting
    record.displayName = record.name.givenName + " " + record.name.familyName;

    console.log("Adding to the addressbook", record);
    window.navigator.mozContacts.create(AB.contactCreated,
                                        AB.displayErrorMsg,
                                        record);
    return false;
  },

  contactCreated: function contactCreated() {
    AB.closeContactEditForm();
    AB.updateContactListing();
  },

  displayErrorMsg: function displayErrorMsg(error) {
    console.error("There was an error adding contact", error);
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
    // Nuke existing content from the table.
    let table = document.getElementById("contactList");
    while (table.tBodies.length) {
      table.removeChild(table.tBodies[0]);
    }

    let tbody = document.createElement("tbody");
    if (!contacts.length) {
      let tr = document.createElement("tr");
      tbody.appendChild(tr);
      let td = document.createElement("td");
      tr.appendChild(td);
      td.textContent = "(No contacts)";
    }

    for (let i = 0; i < contacts.length; i++) {
      let contact = contacts[i];

      let tr = document.createElement("tr");
      tr.id = contact.id;
      tbody.appendChild(tr);
      let td = document.createElement("td");
      tr.appendChild(td);
      td.textContent = contact.displayName;
    }
    table.appendChild(tbody);
  },

  onContactListClick: function onContactListClick(event) {
    let row = event.target;
    while (row.localName != "tr") {
      row = row.parentNode;
      if (!row) {
        return;
      }
    }

    let table = document.getElementById("contactList");
    let old_row = table.querySelector(".selected");
    if (old_row) {
      old_row.classList.remove("selected");
    }

    row.classList.add("selected");
    let contact_id = row.id;
    console.log("Selected", contact_id);

    window.navigator.mozContacts.find(["id", /*ALL OF THEM*/],
                                      AB.displayContactDetails,
                                      function (error) { /* TODO */ },
                                      {filter: {id: contact_id}});
  },

  displayContactDetails: function displayContactDetails(contacts) {
    AB.closeContactEditForm();

    console.log("Should get one contact:", contacts.length);
    let contact = AB.currentContact = contacts[0];

    document.getElementById("view.displayName").textContent =
      contact.displayName;

    let tbody = document.createElement("tbody");
    ["phoneNumbers", "emails", "addresses"].forEach(function (field) {
      let table = document.getElementById("view." + field);
      while (table.tBodies.length) {
        table.removeChild(table.tBodies[0]);
      }
      let tbody = document.createElement("tbody");

      contact[field].forEach(function (entry) {
        if (!entry.value) {
          return;
        }
        let tr = document.createElement("tr");
        let type_label = document.createElement("th");
        type_label.textContent = FIELD_TYPES[entry.type];
        tr.appendChild(type_label);
        let value = document.createElement("td");
        value.textContent = entry.value;
        tr.appendChild(value);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
    });

    document.getElementById("contactView").style.display = "block";
  },

  deleteContact: function deleteContact() {
    let table = document.getElementById("contactList");
    let row = table.querySelector(".selected");
    if (!row) {
      console.log("Could not find any selected element.");
      return false;
    }
    let contact_id = row.id;
    window.navigator.mozContacts.delete(AB.contactDeleted,
                                        AB.displayErrorMsg,
                                        contact_id);
    return false;
  },

  contactDeleted: function contactDeleted() {
    let table = document.getElementById("contactList");
    let row = table.querySelector(".selected");
    row.parentNode.removeChild(row);
    document.getElementById("contactView").style.display = "none";
  },

  onFilterKeyUp: function onFilterKeyUp(event) {
    console.log(event.keyCode, event.charCode, event.target.value);
    let query = event.target.value;
    let fields = ["displayName"]; //TODO
    window.navigator.mozContacts.find(["id", /*ALL OF THEM*/],
                                      AB.displayContactList,
                                      function (error) { /* TODO */ },
                                      {search: {query: query, fields: fields}});
  }

};
