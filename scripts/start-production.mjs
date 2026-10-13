// Make `npm start` serve the built SPA without requiring a shell-specific env prefix.
process.env.NODE_ENV = 'production';
await import('../dist/server.cjs');
