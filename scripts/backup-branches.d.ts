export interface NeonBranch {
  id: string;
  name: string;
  created_at: string;
}

export declare function staleBackups(
  branches: NeonBranch[],
  keep?: number,
): NeonBranch[];
