# Self-Hosting And Data Ownership

Fastifly is made for people who want to keep their finance data under their own control.

You should know where your data lives. You should be able to back it up. You should not need a complicated cloud setup just to track household money.

## Simple To Run

The simplest setup is:

```text
Fastifly app
SQLite database file
```

That is enough for personal use, couples, families, and small self-hosted installs.

## Room To Grow

If you want a larger database setup, Fastifly can also use PostgreSQL.

This is useful if you already run PostgreSQL or want a more advanced production setup.

## No Extra Services For The Core App

Fastifly does not need these services for the core app:

- Redis
- Kafka
- Elasticsearch
- a hosted queue
- a cloud-only database

The goal is to keep self-hosting understandable.

## Backups Matter

Your finance data should be backed up like any other important data.

With SQLite, that means protecting the database file. With PostgreSQL, that means using normal PostgreSQL backup tools.

## Current Limit

Fastifly currently expects one writer app process.

That is fine for the first self-hosted version. Running many app servers that all write to the same ledger will need one more safety layer first.

We document that clearly because your financial records are more important than pretending every scaling setup is already safe.
