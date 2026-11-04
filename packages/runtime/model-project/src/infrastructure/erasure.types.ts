export interface ErasureTarget {
  ownerId: string;
  projectId: string | null;
}
export interface ErasureReceipt extends ErasureTarget {
  exportIds: string[];
  invitationIds: string[];
}
