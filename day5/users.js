const API_URL = "https://jsonplaceholder.typicode.com/users";

const loadButton = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusEl = document.getElementById("status");
const usersList = document.getElementById("users-list");

// All loaded users are stored here, so filtering never needs a new request.
let allUsers = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

// Draws any array of users into the list.
function renderUsers(list) {
  usersList.replaceChildren();

  if (list.length === 0) {
    setStatus("No users match your filter.");
    return;
  }

  for (const user of list) {
    const li = document.createElement("li");

    const name = document.createElement("h2");
    name.textContent = user.name;

    const email = document.createElement("p");
    email.textContent = "Email: " + user.email;

    const city = document.createElement("p");
    city.textContent = "City: " + user.address.city;

    const company = document.createElement("p");
    company.textContent = "Company: " + user.company.name;

    li.append(name, email, city, company);
    usersList.appendChild(li);
  }

  setStatus("Showing " + list.length + " of " + allUsers.length + " users.");
}

async function loadUsers() {
  loadButton.disabled = true;
  setStatus("Loading users...");
  usersList.replaceChildren();

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error("Request failed with status " + response.status);
    }

    allUsers = await response.json();
    applyFilter(); // respects any text already typed in the filter box
    if (allUsers.length > 0 && filterInput.value.trim() === "") {
      setStatus("Loaded " + allUsers.length + " users.");
    }
  } catch (error) {
    allUsers = [];
    setStatus("Could not load users: " + error.message, true);
  } finally {
    loadButton.disabled = false;
  }
}

// Filters the stored array (no new request) and re-renders.
function applyFilter() {
  const text = filterInput.value.trim().toLowerCase();
  const matches = allUsers.filter(function (user) {
    return user.name.toLowerCase().includes(text);
  });
  renderUsers(matches);
}

loadButton.addEventListener("click", loadUsers);
filterInput.addEventListener("input", function () {
  if (allUsers.length === 0) {
    return; // nothing loaded yet, so nothing to filter
  }
  applyFilter();
});