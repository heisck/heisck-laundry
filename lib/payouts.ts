import { FIXED_PACKAGE_CHARGE_GHS } from "@/lib/package-pricing";
import type {
  ExpressBusinessSummary,
  LaundryWorker,
  PackageTaskAssignmentRecord,
  PackageType,
  PackageTypeSummary,
  PackageStatus,
  PayableTaskType,
  PayoutOwnerSide,
  WeekReportRow,
  WeekTaskEntry,
  WorkerPayoutSummary,
} from "@/lib/types";

const WORKER_LABELS: Record<LaundryWorker, string> = {
  GIFTY_BLESSING: "Gifty Blessing",
  EUGEN: "Eugen",
  NOBODY: "Nobody",
};

const TASK_LABELS: Record<PayableTaskType, string> = {
  INTAKE: "Intake",
  WASHING: "Washing",
  DRYING_DOWNSTAIRS: "Drying Downstairs",
  REMOVED_FROM_LINE: "Removed From Line",
  FOLDED: "Folded",
  DRYER_OPERATION: "Dryer Operation",
  REMOVED_AND_FOLDED_FROM_DRYER: "Removed and Folded From Dryer",
};

const OWNER_SIDE_LABELS: Record<PayoutOwnerSide, string> = {
  YOUR_SIDE: "Your Side",
  PARTNER_SIDE: "Partner Side",
};

interface TaskDefinition {
  taskType: PayableTaskType;
  amountGhs: number;
  ownerSide: PayoutOwnerSide;
}

export interface ReadyForPickupTaskInput {
  removeWorkerName?: LaundryWorker;
  foldCompleted?: boolean;
  foldWorkerName?: LaundryWorker;
}

function toMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function getWorkerLabel(worker: LaundryWorker): string {
  return WORKER_LABELS[worker];
}

export function getTaskLabel(taskType: PayableTaskType): string {
  return TASK_LABELS[taskType];
}

export function getOwnerSideLabel(ownerSide: PayoutOwnerSide): string {
  return OWNER_SIDE_LABELS[ownerSide];
}

export function getAutomaticTaskForStatus(
  packageType: PackageType,
  status: PackageStatus,
): TaskDefinition | null {
  if (status === "RECEIVED") {
    return null;
  }

  if (status === "WASHING") {
    return {
      taskType: "WASHING",
      amountGhs: 2.5,
      ownerSide: "YOUR_SIDE",
    };
  }

  if (packageType === "NORMAL_WASH_DRY" && status === "DRYING") {
    return {
      taskType: "DRYING_DOWNSTAIRS",
      amountGhs: 2.5,
      ownerSide: "YOUR_SIDE",
    };
  }

  if (packageType === "NORMAL_WASH_DRY" && status === "READY_FOR_PICKUP") {
    return {
      taskType: "REMOVED_FROM_LINE",
      amountGhs: 2.5,
      ownerSide: "YOUR_SIDE",
    };
  }

  if (packageType === "EXPRESS_WASH_DRY" && status === "DRYING") {
    return {
      taskType: "DRYER_OPERATION",
      amountGhs: 2.5,
      ownerSide: "PARTNER_SIDE",
    };
  }

  return null;
}

export function getPayableTaskForStatus(
  packageType: PackageType,
  status: PackageStatus,
): TaskDefinition | null {
  return getAutomaticTaskForStatus(packageType, status);
}

export function getIntakeTask(): TaskDefinition {
  return {
    taskType: "INTAKE",
    amountGhs: 2.5,
    ownerSide: "YOUR_SIDE",
  };
}

export function requiresReadyForPickupDetails(
  packageType: PackageType,
  nextStatus: PackageStatus,
): boolean {
  return (
    nextStatus === "READY_FOR_PICKUP" &&
    (packageType === "NORMAL_WASH_DRY" || packageType === "EXPRESS_WASH_DRY")
  );
}

export function getReadyForPickupTasks(
  packageType: PackageType,
  input?: ReadyForPickupTaskInput,
): TaskDefinition[] {
  if (packageType === "NORMAL_WASH_DRY") {
    const tasks: TaskDefinition[] = [
      {
        taskType: "REMOVED_FROM_LINE",
        amountGhs: 1.75,
        ownerSide: "YOUR_SIDE",
      },
    ];

    if (input?.foldCompleted) {
      tasks.push({
        taskType: "FOLDED",
        amountGhs: 1.75,
        ownerSide: "YOUR_SIDE",
      });
    }

    return tasks;
  }

  if (packageType === "EXPRESS_WASH_DRY") {
    return [
      {
        taskType: "REMOVED_AND_FOLDED_FROM_DRYER",
        amountGhs: 2.5,
        ownerSide: "PARTNER_SIDE",
      },
    ];
  }

  return [];
}

export function shouldSendStatusSms(status: PackageStatus): boolean {
  return status === "READY_FOR_PICKUP" || status === "PICKED_UP";
}

export function buildPackageTypeSummary(
  rows: Array<Pick<WeekReportRow, "package_type">>,
): PackageTypeSummary {
  return rows.reduce<PackageTypeSummary>(
    (summary, row) => {
      if (row.package_type === "WASH_ONLY") {
        summary.wash_only_count += 1;
      } else if (row.package_type === "NORMAL_WASH_DRY") {
        summary.normal_wash_dry_count += 1;
      } else {
        summary.express_wash_dry_count += 1;
      }

      return summary;
    },
    {
      wash_only_count: 0,
      normal_wash_dry_count: 0,
      express_wash_dry_count: 0,
    },
  );
}

export function createEmptyPackageTypeSummary(): PackageTypeSummary {
  return {
    wash_only_count: 0,
    normal_wash_dry_count: 0,
    express_wash_dry_count: 0,
  };
}

export function buildExpressBusinessSummary(
  rows: Array<Pick<WeekReportRow, "package_type" | "total_weight_kg" | "total_price_ghs">>,
): ExpressBusinessSummary {
  const expressRows = rows.filter((row) => row.package_type === "EXPRESS_WASH_DRY");
  const expressTotalWeightKg = expressRows.reduce(
    (sum, row) => sum + row.total_weight_kg,
    0,
  );
  const yourExpressShareGhs = toMoney(expressTotalWeightKg * 8);
  const partnerExpressShareGhs = toMoney(expressTotalWeightKg * 6);
  const expressFixedChargeTotalGhs = toMoney(
    expressRows.reduce(
      (sum, row) =>
        sum + (row.total_price_ghs - row.total_weight_kg * 14),
      0,
    ),
  );

  return {
    express_package_count: expressRows.length,
    express_total_weight_kg: toMoney(expressTotalWeightKg),
    your_express_share_ghs: yourExpressShareGhs,
    partner_express_share_ghs: partnerExpressShareGhs,
    express_fixed_charge_total_ghs:
      expressFixedChargeTotalGhs || expressRows.length * FIXED_PACKAGE_CHARGE_GHS,
  };
}

export function createEmptyExpressBusinessSummary(): ExpressBusinessSummary {
  return {
    express_package_count: 0,
    express_total_weight_kg: 0,
    your_express_share_ghs: 0,
    partner_express_share_ghs: 0,
    express_fixed_charge_total_ghs: 0,
  };
}

function createEmptyWorkerSummary(
  workerName: LaundryWorker,
): WorkerPayoutSummary {
  return {
    worker_name: workerName,
    intake_count: 0,
    washing_count: 0,
    drying_downstairs_count: 0,
    removed_from_line_count: 0,
    folded_count: 0,
    dryer_operation_count: 0,
    removed_and_folded_from_dryer_count: 0,
    your_side_total_ghs: 0,
    partner_side_total_ghs: 0,
    grand_total_ghs: 0,
  };
}

export function buildWorkerPayoutSummaries(
  entries: Array<Pick<WeekTaskEntry, "worker_name" | "task_type" | "owner_side" | "amount_ghs">>,
): WorkerPayoutSummary[] {
  const trackedWorkers: LaundryWorker[] = ["GIFTY_BLESSING", "EUGEN"];
  const summaries = trackedWorkers.map((worker) => createEmptyWorkerSummary(worker));
  const summaryByWorker = new Map(
    summaries.map((summary) => [summary.worker_name, summary]),
  );

  for (const entry of entries) {
    if (!summaryByWorker.has(entry.worker_name)) {
      continue;
    }

    const summary = summaryByWorker.get(entry.worker_name)!;
    if (entry.task_type === "INTAKE") {
      summary.intake_count += 1;
    } else if (entry.task_type === "WASHING") {
      summary.washing_count += 1;
    } else if (entry.task_type === "DRYING_DOWNSTAIRS") {
      summary.drying_downstairs_count += 1;
    } else if (entry.task_type === "REMOVED_FROM_LINE") {
      summary.removed_from_line_count += 1;
    } else if (entry.task_type === "FOLDED") {
      summary.folded_count += 1;
    } else if (entry.task_type === "DRYER_OPERATION") {
      summary.dryer_operation_count += 1;
    } else if (entry.task_type === "REMOVED_AND_FOLDED_FROM_DRYER") {
      summary.removed_and_folded_from_dryer_count += 1;
    }

    if (entry.owner_side === "YOUR_SIDE") {
      summary.your_side_total_ghs = toMoney(
        summary.your_side_total_ghs + entry.amount_ghs,
      );
    } else {
      summary.partner_side_total_ghs = toMoney(
        summary.partner_side_total_ghs + entry.amount_ghs,
      );
    }

    summary.grand_total_ghs = toMoney(
      summary.your_side_total_ghs + summary.partner_side_total_ghs,
    );
  }

  return summaries;
}

export function createEmptyWorkerPayoutSummaries(): WorkerPayoutSummary[] {
  return (["GIFTY_BLESSING", "EUGEN"] as const).map((worker) =>
    createEmptyWorkerSummary(worker),
  );
}

export function toWeekTaskEntries(
  rows: WeekTaskEntry[] | PackageTaskAssignmentRecord[],
): WeekTaskEntry[] {
  return rows.map((row) => ({
    id: row.id,
    week_id: row.week_id,
    package_id: row.package_id,
    order_id: "order_id" in row ? row.order_id : "",
    room_number: "room_number" in row ? row.room_number : "",
    package_type:
      "package_type" in row ? row.package_type : "NORMAL_WASH_DRY",
    task_type: row.task_type,
    worker_name: row.worker_name,
    owner_side: row.owner_side,
    amount_ghs: row.amount_ghs,
    assigned_at: row.assigned_at,
  }));
}
