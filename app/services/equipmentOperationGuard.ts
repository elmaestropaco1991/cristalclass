export interface EquipmentOperationGuard {
  readonly isProcessing: boolean;
  run(operation: () => Promise<void>): Promise<boolean>;
}

export function createEquipmentOperationGuard(): EquipmentOperationGuard {
  let processing = false;

  return {
    get isProcessing() {
      return processing;
    },
    async run(operation) {
      if (processing) return false;

      processing = true;
      try {
        await operation();
        return true;
      } finally {
        processing = false;
      }
    },
  };
}
