/**
 * STATLAB — English strings (partial).
 * ---------------------------------------------------------------------------
 * This locale exists to prove the i18n architecture works end to end: any key
 * missing here falls back to `es-ES` automatically, so the app never breaks
 * while the translation is completed. Add keys progressively.
 */
export default {
  app: {
    name: 'STATLAB Loyola',
    nameShort: 'STATLAB',
    suffix: 'Loyola',
    tagline: 'Learn statistics by experimenting',
    loading: 'Loading…',
    error: 'Something went wrong',
    retry: 'Try again',
  },

  a11y: {
    skipToContent: 'Skip to main content',
    close: 'Close',
    menu: 'User menu',
    theme: 'Toggle light and dark theme',
  },

  nav: {
    home: 'Home',
    campaign: 'Campaign',
    lab: 'Lab',
    quick: 'Quick play',
    challenge: 'Weekly challenge',
    assignments: 'My assignments',
    progress: 'My progress',
    mistakes: 'My mistakes',
    ranking: 'Rankings',
    teacher: 'Teacher panel',
    login: 'Sign in',
    register: 'Create account',
    logout: 'Sign out',
    account: 'My account',
  },

  landing: {
    heroSub: 'Learn statistics and biostatistics by experimenting with health data: simulate, '
      + 'manipulate, decide and interpret. Do not memorise formulas.',
    ctaStart: 'Enter',
    ctaDemo: 'Try without signing up',
    ctaRegister: 'Create account',
    centralQuestion: '“What should I do with these data, and why?”',
  },

  auth: {
    loginTitle: 'Sign in',
    registerTitle: 'Create account',
    email: 'Email address',
    password: 'Password',
    passwordRepeat: 'Repeat password',
    firstName: 'First name',
    lastName: 'Last name',
    degree: 'Degree',
    alias: 'Public alias',
    signIn: 'Sign in',
    signUp: 'Create account',
    forgot: 'Forgot your password?',
  },

  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    confirm: 'Confirm',
    total: 'Total',
    mean: 'Mean',
    median: 'Median',
    loading: 'Loading…',
  },

  challenge: {
    title: 'Weekly challenge',
    start: 'Start challenge',
    challengePoints: 'Challenge Points',
    accuracy: 'Accuracy and resolution',
    efficiency: 'Efficiency (errors)',
    time: 'Time',
    hints: 'Hints',
  },

  ranking: {
    title: 'Rankings',
    weekly: 'Weekly ranking',
    seasonal: 'Season ranking',
    position: 'Position',
    alias: 'Alias',
    points: 'Points',
    aliasOnly: 'Rankings show aliases only. Never names or email addresses.',
  },

  footer: {
    notAGrade: 'XP, Challenge Points and mastery are formative indicators, not academic grades.',
    createdBy: 'Created by',
    affiliation: 'Department of Quantitative Methods · Universidad Loyola Andalucía',
  },
};
