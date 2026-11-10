export interface RunCountsDto { pending: number; processing: number; done: number; failed: number; skipped: number }

export interface RunSummaryDto {
  id: string;
  configName: string;
  periodKey: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  counts: RunCountsDto;
}

/** What a filed bill looks like on screen. Amounts arrive already formatted. */
export interface BillBriefDto {
  amountText: string | null;
  needsReview: boolean;
  confidence: string;
  method: string;
  note: string | null;
  billDate: string | null;
  dueDate: string | null;
  driveLink: string | null;
}

export interface RunItemDto {
  id: string;
  sourceName: string;
  subject: string;
  fromAddress: string;
  messageDate: string;
  attachmentName: string | null;
  status: string;
  error: string | null;
  attempts: number;
  canRetry: boolean;
  bill: BillBriefDto | null;
}

export interface RunDetailDto extends RunSummaryDto {
  items: RunItemDto[];
}

/** What one processing step reports back to the progress screen. */
export interface StepDto {
  runStatus: string;
  counts: RunCountsDto;
  finished: boolean;
  item: RunItemDto | null;
}

export interface StartRunOptions {
  configs: { id: string; name: string; defaultPeriod: string }[];
  periods: string[];
}
