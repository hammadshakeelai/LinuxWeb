export interface HomeRecord {
  data: Uint8Array;
  bytes: number;
  savedAt: number;
}

export interface MachineSummary {
  id: string;
  name: string;
  createdAt: number;
  bytes: number;
}

export interface MachineRecord extends MachineSummary {
  data: Uint8Array;
}

const HOME = "home";
const MACHINES = "machines";
const HOME_KEY = "current";

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener("complete", () => resolve());
    tx.addEventListener("error", () => reject(tx.error));
    tx.addEventListener("abort", () => reject(tx.error));
  });
}

export class Store {
  private readonly db: IDBDatabase;

  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  static async open(dbName = "linuxweb"): Promise<Store> {
    const request = indexedDB.open(dbName, 1);
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(HOME);
      request.result.createObjectStore(MACHINES, { keyPath: "id" });
    });
    return new Store(await done(request));
  }

  async getHome(): Promise<HomeRecord | undefined> {
    return done(this.db.transaction(HOME).objectStore(HOME).get(HOME_KEY));
  }

  async putHome(record: HomeRecord): Promise<void> {
    const tx = this.db.transaction(HOME, "readwrite");
    tx.objectStore(HOME).put(record, HOME_KEY);
    await committed(tx);
  }

  async clearHome(): Promise<void> {
    const tx = this.db.transaction(HOME, "readwrite");
    tx.objectStore(HOME).delete(HOME_KEY);
    await committed(tx);
  }

  async listMachines(): Promise<MachineSummary[]> {
    const all: MachineRecord[] = await done(this.db.transaction(MACHINES).objectStore(MACHINES).getAll());
    return all
      .map(({ id, name, createdAt, bytes }) => ({ id, name, createdAt, bytes }))
      .toSorted((a, b) => b.createdAt - a.createdAt);
  }

  async getMachine(id: string): Promise<MachineRecord | undefined> {
    return done(this.db.transaction(MACHINES).objectStore(MACHINES).get(id));
  }

  async putMachine(record: MachineRecord): Promise<void> {
    const tx = this.db.transaction(MACHINES, "readwrite");
    tx.objectStore(MACHINES).put(record);
    await committed(tx);
  }

  async renameMachine(id: string, name: string): Promise<void> {
    const record = await this.getMachine(id);
    if (record) await this.putMachine({ ...record, name });
  }

  async deleteMachine(id: string): Promise<void> {
    const tx = this.db.transaction(MACHINES, "readwrite");
    tx.objectStore(MACHINES).delete(id);
    await committed(tx);
  }
}
