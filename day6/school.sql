-- Day 6: School database (SQLite)

PRAGMA foreign_keys = ON;

-- Start clean so the script can be re-run
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- 1. TABLES

CREATE TABLE students (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    title   TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE enrolments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL,
    course_id   INTEGER NOT NULL,
    grade       TEXT,
    enrolled_on TEXT NOT NULL DEFAULT (date('now')),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id)  REFERENCES courses(id),
    UNIQUE (student_id, course_id)
);

-- 2. SAMPLE DATA

INSERT INTO students (first_name, last_name, email) VALUES
    ('Amina',  'Hassan', 'amina@example.com'),
    ('Brian',  'Otieno', 'brian@example.com'),
    ('Chloe',  'Mwangi', 'chloe@example.com'),
    ('Daniel', 'Kamau',  'daniel@example.com');

INSERT INTO courses (title, credits) VALUES
    ('Web Foundations', 10),
    ('Databases',       10),
    ('JavaScript',      15);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
    (1, 1, 'A'),
    (1, 2, 'B'),
    (2, 1, 'B'),
    (2, 3, NULL),
    (3, 2, 'A'),
    (3, 3, 'C');
    -- 3. QUERIES

-- Q1. All courses for one student (by name)
SELECT c.title, e.grade
FROM students s
JOIN enrolments e ON e.student_id = s.id
JOIN courses c    ON c.id = e.course_id
WHERE s.first_name = 'Amina' AND s.last_name = 'Hassan';

-- Q2. All students on one course
SELECT s.first_name, s.last_name, e.grade
FROM courses c
JOIN enrolments e ON e.course_id = c.id
JOIN students s   ON s.id = e.student_id
WHERE c.title = 'Databases';

-- Q3. Number of students per course
SELECT c.title, COUNT(e.id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_id = c.id
GROUP BY c.id, c.title;

-- Q4. Students who have no enrolments
SELECT s.first_name, s.last_name, s.email
FROM students s
LEFT JOIN enrolments e ON e.student_id = s.id
WHERE e.id IS NULL;

-- Q5. Update one enrolment's grade (Brian's JavaScript grade)
UPDATE enrolments
SET grade = 'B'
WHERE student_id = (SELECT id FROM students WHERE email = 'brian@example.com')
  AND course_id  = (SELECT id FROM courses WHERE title = 'JavaScript');

-- Check the update worked
SELECT s.first_name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses c  ON c.id = e.course_id
WHERE s.email = 'brian@example.com';