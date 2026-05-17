export type RescuePriority = 'critical' | 'high' | 'medium' | 'low';
export type RescueStatus = 'new' | 'triaged' | 'responding' | 'resolved';

export type RescueReport = {
  id: string;
  household: string;
  location: string;
  priority: RescuePriority;
  status: RescueStatus;
  people: number;
  notes: string;
  createdAt: number;
};
