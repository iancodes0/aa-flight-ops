module.exports = {
  apps: [
    {
      name: 'aa-flight-ops-bot',
      script: './bot/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '250M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    }
  ]
};
