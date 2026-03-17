const profile = process.env.EAS_BUILD_PROFILE || process.env.APP_VARIANT || 'production';

const packageSuffixes = {
  development: '.dev',
  preview: '.preview',
  production: '',
};

module.exports = {
  project: {
    android: {
      sourceDir: './android',
      packageName: `com.eagleprotect.employee${packageSuffixes[profile] || ''}`,
    },
  },
};
