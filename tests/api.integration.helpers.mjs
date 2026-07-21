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
  constructor(name, initialRows = []) {
    this.name = name;
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
    if (this.name === "sessions" && inserted.is_current) {
      const conflicts = this.rows.some((row) => (
        row.is_current
        && row.owner_id === inserted.owner_id
        && row.mode === inserted.mode
      ));
      if (conflicts) {
        const error = new Error("duplicate key value violates unique constraint");
        error.code = "23505";
        throw error;
      }
    }
    if (this.name === "live_audio_chunks") {
      const conflict = this.rows.some((row) => (
        row.session_id === inserted.session_id
        && row.group_id === inserted.group_id
        && row.client_chunk_id === inserted.client_chunk_id
      ));
      if (conflict) {
        const error = new Error("duplicate key value violates unique constraint");
        error.code = "23505";
        throw error;
      }
    }
    this.rows.push(inserted);
    return {
      acknowledged: true,
      insertedId: inserted._id ?? null,
      inserted: clone(inserted)
    };
  }

  async insertMany(documents = []) {
    const insertedIds = {};
    documents.forEach((document, index) => {
      const inserted = clone(document);
      this.rows.push(inserted);
      insertedIds[index] = inserted._id ?? null;
    });
    return {
      acknowledged: true,
      insertedCount: documents.length,
      insertedIds
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

  async updateOne(filter, update, options = {}) {
    const index = this.rows.findIndex((row) => matchesFilter(row, filter));
    if (index === -1) {
      if (options.upsert) {
        const inserted = applyUpdateOperators(filter, update);
        this.rows.push(inserted);
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }

      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }

    this.rows[index] = applyUpdateOperators(this.rows[index], update);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
  }

  async deleteOne(filter = {}) {
    const index = this.rows.findIndex((row) => matchesFilter(row, filter));
    if (index === -1) {
      return { deletedCount: 0 };
    }

    this.rows.splice(index, 1);
    return { deletedCount: 1 };
  }

  async deleteMany(filter = {}) {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !matchesFilter(row, filter));
    return { deletedCount: before - this.rows.length };
  }
}

export function createDbOverrides(seed = {}) {
  const collections = new Map(
    Object.entries(seed).map(([name, initialRows]) => [name, new InMemoryCollection(name, initialRows)])
  );

  return {
    collection(name) {
      if (!collections.has(name)) {
        collections.set(name, new InMemoryCollection(name, []));
      }

      return collections.get(name);
    },
    dump(name) {
      return collections.has(name) ? clone(collections.get(name).rows) : [];
    }
  };
}
