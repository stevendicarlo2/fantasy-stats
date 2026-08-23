# Repository Guidance

## Core Principles

- Keep presentation, application/domain logic, and external data access isolated behind explicit interfaces.
- Client code must not communicate directly with databases, remote APIs, scrapers, or other external providers.
- Keep provider-specific clients, payloads, credentials, and failure handling inside their adapters. Expose application-owned types at adapter boundaries.
- Prefer the smallest complete implementation that satisfies the documented scope. Do not add speculative abstractions, generic frameworks, or deferred features without a concrete requirement.
- Never commit credentials, private user or league data, authentication material, or unredacted diagnostic payloads. Use synthetic or redacted fixtures and examples.
- Validate untrusted data at system boundaries and surface failures explicitly rather than silently substituting defaults.
- Preserve type safety and test externally observable behavior at architectural boundaries.

## Documentation

- Use `docs/` for repository-wide architecture, product, feature, and decision documentation. Use co-located `docs/` directories for subsystem-specific documentation.
- Before changing behavior, search for and read relevant documentation in the repository-wide `docs/` directory and in the affected subsystem or implementation.
- Treat documentation README files as guides to documentation organization, not exhaustive indexes of available documents.
- Keep product-specific rules in documentation rather than duplicating them in this file.
- Update directly affected documentation when behavior, interfaces, assumptions, or operational requirements change.
- If documentation, implementation, and the requested change disagree, surface the conflict rather than guessing or silently choosing one.
