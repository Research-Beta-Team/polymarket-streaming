export type DataSource = 'chainlink';

export interface SubscriptionMessage {
  action: 'subscribe' | 'unsubscribe';
  subscriptions: Array<{
    topic: string;
    type: string;
    filters?: string;
  }>;
}

export interface PriceUpdate {
  topic: string;
  type: string;
  timestamp: number;
  payload: {
    symbol: string;
    timestamp: number;
    value: number;
  };
}

export interface ConnectionStatus {
  connected: boolean;
  source: DataSource | null;
  lastUpdate: number | null;
  error: string | null;
}

