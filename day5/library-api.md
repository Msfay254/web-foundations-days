# Library API Design

A REST API for a library's `books` resource. All requests and responses use JSON.

## Book object

- `id` - number, assigned by the server
- `title` - string
- `author` - string
- `year` - number
- `isbn` - string

## Endpoints

### List all books

- **Method:** GET
- **Path:** `/books`
- **Description:** Returns an array of all books in the library.
- **Request body:** none
- **Success status:** 200 OK

### Get one book

- **Method:** GET
- **Path:** `/books/{id}`
- **Description:** Returns the single book with the given id.
- **Request body:** none
- **Success status:** 200 OK

### Create a book

- **Method:** POST
- **Path:** `/books`
- **Description:** Adds a new book to the library.
- **Example request body:**

  ```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1958,
    "isbn": "9780385474542"
  }
  ```

- **Success status:** 201 Created

### Update a book

- **Method:** PUT
- **Path:** `/books/{id}`
- **Description:** Replaces the details of an existing book.
- **Example request body:**

  ```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1959,
    "isbn": "9780385474542"
  }
  ```

- **Success status:** 200 OK

### Delete a book

- **Method:** DELETE
- **Path:** `/books/{id}`
- **Description:** Removes the book with the given id.
- **Request body:** none
- **Success status:** 204 No Content

### List books by an author

- **Method:** GET
- **Path:** `/books?author={name}` (for example `/books?author=Chinua%20Achebe`)
- **Description:** Returns only the books written by the given author.
- **Request body:** none
- **Success status:** 200 OK

## Error codes

### 400 Bad Request

- **Meaning:** The request is invalid or malformed.
- **Example:** A POST to `/books` is missing the required `title` field, or `year` is sent as the text "nineteen fifty-eight" instead of a number.

### 404 Not Found

- **Meaning:** The requested resource does not exist.
- **Example:** A GET to `/books/9999` when no book with id 9999 exists, or a DELETE on a book that was already deleted.