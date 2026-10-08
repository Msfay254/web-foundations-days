# School Database Design

## Tables

**students** – one row per person who studies at the school. It stores a first name, last name and email. The `id` is the primary key, and `email` is `UNIQUE` so two students can't share an address (and so it can identify a student reliably).

**courses** – one row per course offered. It stores a title and the number of credits. The `id` is the primary key.

**enrolments** – one row for each fact "this student is enrolled on this course". It holds `student_id` and `course_id` (both foreign keys, both `NOT NULL`), the `grade` (nullable, because a grade doesn't exist until the student has been marked) and the enrolment date. A `UNIQUE (student_id, course_id)` rule stops the same student enrolling on the same course twice.

## Relationships

- **students → enrolments is one-to-many**: one student can have many enrolments, but each enrolment belongs to exactly one student.
- **courses → enrolments is one-to-many**: one course can have many enrolments, but each enrolment belongs to exactly one course.
- **students ↔ courses is many-to-many**: a student takes many courses, and a course has many students.

A join table is needed because a relational column holds a single value. Putting a `course_id` in `students` would allow only one course per student, and putting a list of students in `courses` would break the rule of one value per field and make querying and updating painful. The `enrolments` table solves this by turning one many-to-many relationship into two one-to-many relationships. It is also the natural home for data that belongs to the *pairing* rather than to either side, such as the grade.

## Index

I would add an index on `enrolments(course_id)`:

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

The `UNIQUE (student_id, course_id)` constraint already creates an index that helps lookups by student (it leads with `student_id`), but it doesn't help when searching by course alone. Queries like "all students on this course" and "number of students per course" filter or group on `course_id`, and without an index SQLite would scan the whole enrolments table, which is the table that grows fastest.

## SQL or NoSQL?

I would choose SQL for this system. The data is naturally relational: students, courses and enrolments are linked, and the questions we ask (who is on which course, how many per course, who has no enrolments) are exactly what joins and aggregates are good at. A school also needs data integrity: foreign keys prevent enrolments for students or courses that don't exist, and unique constraints prevent duplicate emails and double enrolments. Updating a grade needs to be reliable, which is where SQL transactions help. The schema is stable and well understood, so the flexibility of a schemaless NoSQL document store isn't needed. NoSQL could become attractive if the system needed to store highly variable data (for example, different assessment formats per course) or to scale across huge numbers of users, but for a typical school the structure and consistency of SQL are the better fit.