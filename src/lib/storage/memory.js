class MemoryPassportStore {
  constructor() {
    this.passports = new Map();
    this.events = [];
  }

  createPassport(passport) {
    const stored = structuredClone(passport);
    this.passports.set(stored.id, stored);
    return structuredClone(stored);
  }

  getPassport(id) {
    const passport = this.passports.get(id);
    return passport ? structuredClone(passport) : null;
  }

  getPassportByPublicId(publicId) {
    const passport = [...this.passports.values()].find(
      (item) => item.publicId === publicId && item.status === "published"
    );

    return passport ? structuredClone(passport) : null;
  }

  listPassports(options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 100);

    return [...this.passports.values()]
      .filter((passport) => !options.status || passport.status === options.status)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .map((passport) => structuredClone(passport));
  }

  updatePassport(id, changes) {
    const existing = this.passports.get(id);

    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      ...structuredClone(changes),
    };

    this.passports.set(id, updated);
    return structuredClone(updated);
  }

  recordEvent(event) {
    this.events.push(structuredClone(event));
  }

  listEvents(passportId) {
    return this.events
      .filter((event) => event.passportId === passportId)
      .map((event) => structuredClone(event));
  }
}

module.exports = {
  MemoryPassportStore,
};
