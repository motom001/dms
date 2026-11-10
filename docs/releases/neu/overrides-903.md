art: keine

## Intern

- **Override für glob entfernt** (#903): `@fastify/static` verlangt glob `^14` jetzt selbst. Der Override für minimatch bleibt: Ohne ihn bekäme ESLint minimatch 10.2.6 mit der Lücke GHSA-g3hv-75wg-m249 (betroffen bis 11.0.0, für 10.x gibt es keinen Fix). Nur Entwicklungswerkzeuge, nicht im Image.
