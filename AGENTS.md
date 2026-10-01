# Data modelling

ONE BUSINESS ATTRIBUTE PER COLUMN is the canonical rule for all new or
modified Timan data models. Follow [docs/data-modeling-principles.md](docs/data-modeling-principles.md).
Use native types and relational child rows. Preserve legacy data and historical
commercial snapshots; never rebuild historical prices from today's catalogue.
