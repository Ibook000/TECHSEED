module.exports = {
  apps: [
    {
      name: 'techseed',
      script: 'dist/server.cjs',
      cwd: '/opt/techseed',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 80,
      },
      max_memory_restart: '400M',
      autorestart: true,
      max_restarts: 10,
      exp_backoff_restart_delay: 200,
    },
  ],
};
