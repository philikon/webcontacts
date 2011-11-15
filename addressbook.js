"use strict";

const SIMPLE_LIST_FIELDS = ["phoneNumbers",
                            "emails",
                            "addresses", // for now
                            "ims",
                            "urls"];

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
  addresses:    "Address",
  ims:          "IM name",
  urls:         "URL"
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
  },

  newContactForm: function newContactForm() {
    document.getElementById("newContactButton").disabled = true;

    AB.currentContact = {displayName: "",
                         name: {familyName: "",
                                givenName: "",
                                honorificPrefix: "",
                                honorificSuffic: "",
                                middleName: ""},
                         nickname: "",
                         phoneNumbers: [],
                         emails: [],
                         addresses: [],
                         ims: [],
                         organizations: [],
                         birthday: null,
                         note: "",
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

    return this.editContact();
  },

  editContact: function editContact() {
    let contact = AB.currentContact;

    document.getElementById("edit.name.givenName").value =
      contact.name.givenName || "";
    document.getElementById("edit.name.familyName").value =
      contact.name.familyName || "";
    document.getElementById("edit.birthday").value = contact.birthday || "";
    document.getElementById("edit.note").value = contact.note || "";

    SIMPLE_LIST_FIELDS.forEach(function (field) {
      let value = contact[field];
      if (!value) {
        value = contact[field] = [];
      }
      for (let i = 0; i < value.length; i++) {
        AB.newSimpleListEntry(field, i);
      }
      if (!value.length) {
        // Just create an empty row.
        AB.newSimpleListEntry(field);
      }
    });

    document.getElementById("contactEdit").style.display = "block";
    document.getElementById("contactView").style.display = "none";
    return false;    
  },

  /**
   * Create a new form fields for a simple list entry (e.g. email, IM, etc.)
   * 
   * @param kind
   *        String indicating which value to create
   * @param index [optional]
   *        Index of an existing entry to prefill form fields with. If this
   *        is not provided, an empty entry is created and appended to the
   *        end of the list.
   */
  newSimpleListEntry: function newSimpleListEntry(kind, index) {
    let kind_list = AB.currentContact[kind];
    let entry;
    if (index == null) {
      index = kind_list.length;
      entry = kind_list[index] = {type: "", value: "", pref: false};
    } else {
      entry = kind_list[index];
    }

    let fieldset = document.getElementById("edit.fieldset." + kind);
    let kind_plus_index = "edit." + kind + "." + index;
    let div = document.createElement("div");
    div.id = kind_plus_index;
    div.classList.add("simpleListEntry");

    let select = document.createElement("select");
    select.id = kind_plus_index + ".type";
    for (let field_type in FIELD_TYPES) {
      let option = document.createElement("option");
      option.value = field_type;
      option.textContent = FIELD_TYPES[field_type];
      if (field_type == entry.type) {
        option.selected = "selected";
      }
      select.appendChild(option);
    }
    div.appendChild(select);
    //TODO automatically figure out which one of the types isn't selected yet
    // so we can select one of the other.

    let input = document.createElement("input");
    input.id = kind_plus_index + ".value";
    input.placeholder = PLACEHOLDERS[kind];
    input.value = entry.value || "";
    div.appendChild(input);

    let button = document.createElement("button");
    button.id = kind_plus_index + ".remove";
    button.setAttribute("onclick", "return AB.removeSimpleListEntry('" +
                                   kind + "', " + index + ");");
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

    let kind_list = AB.currentContact[kind];
    kind_list.splice(index, 1);

    // Rename all following fields.
    let prefix = "edit." + kind + ".";
    for (let i = index; i < kind_list.length; i++) {
      let old_prefix = prefix + (i + 1);
      let new_prefix = prefix + i;
      document.getElementById(old_prefix).id = new_prefix;
      document.getElementById(old_prefix + ".type").id = new_prefix + ".type";
      document.getElementById(old_prefix + ".value").id = new_prefix + ".value";
      let button = document.getElementById(old_prefix + ".remove");
      button.id = new_prefix + ".remove";
      button.setAttribute("onclick", "return AB.removeSimpleListEntry('" +
                                     kind + "', " + i + ");");
    }

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
    form.style.display = "none";

    // Remove all dynamically created elements from the form.
    let simpleListEntries = form.querySelectorAll(".simpleListEntry");
    for (let i = 0; i < simpleListEntries.length; i++) {
      let element = simpleListEntries[i];
      element.parentNode.removeChild(element);
    }

    // Re-enable form fields and reset to default values.
    form.reset();
    let fields = form.elements;
    for (let i = 0; i < fields.length; i++) {
      let field = fields[i];
      field.disabled = false;
    }
  },

  cancelContactEditForm: function cancelContactEditForm() {
    AB.closeContactEditForm();
    AB.updateContactListing();
    return false;
  },

  saveContact: function saveContact() {
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

    // Filter invalid entries from list.
    SIMPLE_LIST_FIELDS.forEach(function (field) {
      let list = record[field];
      if (!list) {
        return;
      }
      record[field] = list.filter(function (entry) {
        return entry.value;
      });
    });

    //TODO this is a locale setting
    record.displayName = record.name.givenName + " " + record.name.familyName;

    if (!AB.currentContact.id) {
      console.log("Adding to the addressbook", record);
      window.navigator.mozContacts.create(AB.contactSaved,
                                          AB.displayErrorMsg,
                                          record);
    } else {
      console.log("Updating the addressbook", record);
      window.navigator.mozContacts.update(AB.contactSaved.bind(AB, record),
                                          AB.displayErrorMsg,
                                          record);
    }

    return false;
  },

  contactSaved: function contactSaved(contact) {
    AB.closeContactEditForm();
    AB.updateContactListing(contact.id);
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

  /**
   * Load contacts from the database and refresh the listing.
   * 
   * @param selected_id [optional]
   *        ID of the record that's to be selected
   */
  updateContactListing: function updateContactListing(selected_id) {
    window.navigator.mozContacts.find(["id", "displayName"],
                                      function (contacts) {
      AB.displayContactList(contacts);
      if (selected_id) {
        let row = document.getElementById(selected_id);
        row.classList.add("selected");
        AB.updateContactDetails(selected_id);
      }
    });
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
    AB.updateContactDetails(contact_id);
  },

  updateContactDetails: function updateContactDetails(contact_id) {
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
    SIMPLE_LIST_FIELDS.forEach(function (field) {
      let table = document.getElementById("view." + field);
      while (table.tBodies.length) {
        table.removeChild(table.tBodies[0]);
      }
      let tbody = document.createElement("tbody");

      let value = contact[field];
      if (!value || !value.length) {
        return;
      }
      value.forEach(function (entry) {
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

    if (contact.birthday) {
      document.getElementById("view.birthday").textContent =
        contact.birthday; //TODO format
    } else {
      document.getElementById("view.birthday").textContent = "";      
    };
    document.getElementById("view.note").textContent = contact.note || "";

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
  },

  clearFilter: function clearFilter() {
    document.getElementById("filter").value = "";
    AB.updateContactListing();
  },

};
