module.exports = {
  apps: [
    {
      name: 'backend',
      script: 'dist/index.js',
      interpreter: 'node',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '5G',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
    },
  ],
};
