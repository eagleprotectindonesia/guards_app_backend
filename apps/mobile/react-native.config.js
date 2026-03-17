const profile = process.env.APP_VARIANT || process.env.EAS_BUILD_PROFILE || 'production';

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
