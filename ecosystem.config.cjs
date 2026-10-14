module.exports = {
  apps: [
    {
      name: 'techseed',
      script: 'dist/server.cjs',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3000,
      },
      max_memory_restart: '400M',
      autorestart: true,
      max_restarts: 10,
      exp_backoff_restart_delay: 200,
    },
  ],
};
