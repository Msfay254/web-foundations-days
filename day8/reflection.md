# Day 8 Reflection

**The most difficult concept and how I overcame it.**
The hardest concept for me was concurrency: two requests can run at the same moment, so "check that the seat is free, then book it" can fail even though each step looks correct. It was hard because the bug never appears when you test alone. I overcame it by drawing a timeline of two users acting at once and by writing out the SQL. When I saw that a single conditional UPDATE lets the database pick one winner, and that a UNIQUE constraint catches any mistake, transactions and constraints finally made sense. Explaining it in my TicketHub design made it clearer still.

**What I would improve in my capstone.**
Using the "Two stars and a wish" feedback and the marking categories, I would improve the part my reviewers found weakest: the architecture explanation. I would build the diagram step by step, naming the problem each component solves and the new problem it creates, as I did for TicketHub. I would also add my estimates earlier and show one trade-off more clearly, so the design is justified by numbers instead of guesses.

**What I will learn next.**
I will start with a real backend using Node.js and Express, turning my API designs into working code. Then I will use a real database such as PostgreSQL, practicing the SQL transactions from this assignment. After that I want to learn React for larger interfaces, and keep reading The System Design Primer to deepen my design skills.
