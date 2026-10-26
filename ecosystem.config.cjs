module.exports = {
  apps: [
    {
      name: 'kredo-portal-backend',
      script: 'dist/main.js',
      node_args: '--enable-source-maps',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5099,
        HOST: '127.0.0.1',
      },
      // Restart if memory exceeds 512MB per worker
      max_memory_restart: '512M',
      // Exponential backoff restart delay
      exp_backoff_restart_delay: 100,
      // Graceful shutdown timeout (ms)
      kill_timeout: 10000,
      // Wait for ready signal before considering app "online"
      wait_ready: true,
      listen_timeout: 10000,
      // Log configuration
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/kredo/error.log',
      out_file: '/var/log/kredo/out.log',
      merge_logs: true,
      // Auto-restart on file changes (disabled for production)
      watch: false,
    },
  ],
};
