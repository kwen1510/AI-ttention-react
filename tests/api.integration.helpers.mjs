function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matchesFilter(record, filter = {}) {
  return Object.entries(filter || {}).every(([key, value]) => {
    const recordValue = record?.[key];

    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (Array.isArray(value.$in)) {
        return value.$in.includes(recordValue);
      }
    }

    return recordValue === value;
  });
}

function applyUpdateOperators(record, update = {}) {
  const nextRecord = clone(record || {});

  if (update.$set) {
    for (const [key, value] of Object.entries(update.$set)) {
      nextRecord[key] = value;
    }
  }

  return nextRecord;
}

class InMemoryCursor {
  constructor(collection, filter = {}) {
    this.collection = collection;
    this.filter = filter;
    this.sortSpec = null;
    this.offset = 0;
    this.countLimit = null;
  }

  sort(sortSpec = {}) {
    this.sortSpec = sortSpec;
    return this;
  }

  skip(offset = 0) {
    this.offset = Number(offset) || 0;
    return this;
  }

  limit(count = 0) {
    this.countLimit = Number(count);
    return this;
  }

  async toArray() {
    let rows = this.collection.rows.filter((row) => matchesFilter(row, this.filter));

    if (this.sortSpec) {
      const sortEntries = Object.entries(this.sortSpec);
      rows = rows.sort((left, right) => {
        for (const [field, direction] of sortEntries) {
          if (left[field] === right[field]) {
            continue;
          }

          const order = direction === -1 || direction === "desc" ? -1 : 1;
          return left[field] > right[field] ? order : -order;
        }

        return 0;
      });
    }

    if (this.offset > 0) {
      rows = rows.slice(this.offset);
    }

    if (Number.isFinite(this.countLimit) && this.countLimit >= 0) {
      rows = rows.slice(0, this.countLimit);
    }

    return clone(rows);
  }

  async count() {
    return this.collection.rows.filter((row) => matchesFilter(row, this.filter)).length;
  }
}

class InMemoryCollection {
  constructor(initialRows = []) {
    this.rows = clone(initialRows);
  }

  find(filter = {}) {
    return new InMemoryCursor(this, filter);
  }

  async countDocuments(filter = {}) {
    return this.find(filter).count();
  }

  async findOne(filter = {}) {
    const match = this.rows.find((row) => matchesFilter(row, filter));
    return match ? clone(match) : null;
  }

  async insertOne(document) {
    const inserted = clone(document);
    this.rows.push(inserted);
    return {
      acknowledged: true,
      insertedId: inserted._id ?? null,
      inserted: clone(inserted)
    };
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const index = this.rows.findIndex((row) => matchesFilter(row, filter));
    if (index === -1) {
      if (options.upsert) {
        const inserted = applyUpdateOperators(filter, update);
        this.rows.push(inserted);
        return clone(inserted);
      }

      return null;
    }

    const nextRecord = applyUpdateOperators(this.rows[index], update);
    this.rows[index] = nextRecord;
    return clone(nextRecord);
  }

  async deleteOne(filter = {}) {
    const index = this.rows.findIndex((row) => matchesFilter(row, filter));
    if (index === -1) {
      return { deletedCount: 0 };
    }

    this.rows.splice(index, 1);
    return { deletedCount: 1 };
  }
}

export function createDbOverrides(seed = {}) {
  const collections = new Map(
    Object.entries(seed).map(([name, initialRows]) => [name, new InMemoryCollection(initialRows)])
  );

  return {
    collection(name) {
      if (!collections.has(name)) {
        collections.set(name, new InMemoryCollection([]));
      }

      return collections.get(name);
    },
    dump(name) {
      return collections.has(name) ? clone(collections.get(name).rows) : [];
    }
  };
}
