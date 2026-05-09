export type TransactionCapable<TTransaction> = {
  readonly transaction: <TResult>(
    callback: (tx: TTransaction) => Promise<TResult> | TResult,
    config?: unknown,
  ) => Promise<TResult>;
};

export async function withDatabaseTransaction<TTransaction, TResult>(
  db: TransactionCapable<TTransaction>,
  callback: (tx: TTransaction) => Promise<TResult> | TResult,
  config?: unknown,
): Promise<TResult> {
  return db.transaction(callback, config);
}
