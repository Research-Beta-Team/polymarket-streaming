import { WebSocketClient } from './websocket-client';
import { EventManager } from './event-manager';
import { getNext15MinIntervals } from './event-utils';
import type { PriceUpdate, ConnectionStatus } from './types';
import type { EventDisplayData } from './event-manager';

export class StreamingPlatform {
  private wsClient: WebSocketClient;
  private eventManager: EventManager;
  private currentPrice: number | null = null;
  private priceHistory: Array<{ timestamp: number; value: number }> = [];
  private maxHistorySize = 100;
  private currentStatus: ConnectionStatus = {
    connected: false,
    source: null,
    lastUpdate: null,
    error: null
  };
  private countdownInterval: number | null = null;
  private eventPriceToBeat: Map<string, number> = new Map(); // Map of event slug to price to beat
  private eventLastPrice: Map<string, number> = new Map(); // Map of event slug to last price (from previous event end)

  constructor() {
    this.wsClient = new WebSocketClient();
    this.eventManager = new EventManager();
    this.eventManager.setOnEventsUpdated(() => {
      this.renderEventsTable();
    });
    this.wsClient.setCallbacks(
      this.handlePriceUpdate.bind(this),
      this.handleStatusChange.bind(this)
    );
  }

  async initialize(): Promise<void> {
    this.render();
    this.setupEventListeners();
    await this.loadEvents();
    this.eventManager.startAutoRefresh(60000); // Refresh every minute
  }

  private setupEventListeners(): void {
    const connectBtn = document.getElementById('connect');
    const disconnectBtn = document.getElementById('disconnect');

    connectBtn?.addEventListener('click', () => {
      this.wsClient.connect();
    });

    disconnectBtn?.addEventListener('click', () => {
      this.wsClient.disconnect();
      this.currentStatus = {
        connected: false,
        source: null,
        lastUpdate: null,
        error: null
      };
      this.updateUI();
    });
  }

  private handlePriceUpdate(update: PriceUpdate): void {
    this.currentPrice = update.payload.value;
    this.priceHistory.push({
      timestamp: update.payload.timestamp,
      value: update.payload.value
    });

    if (this.priceHistory.length > this.maxHistorySize) {
      this.priceHistory.shift();
    }

    // Check if we need to capture price for a newly active event
    this.capturePriceForActiveEvent();
    
    // Check if an event just expired and capture the price for the next event
    this.capturePriceForExpiredEvent();

    this.updatePriceDisplay();
  }

  private capturePriceForExpiredEvent(): void {
    if (this.currentPrice === null) return;

    const events = this.eventManager.getEvents();
    
    // For each event, check if the previous event just expired
    events.forEach((event, index) => {
      if (index > 0) {
        const previousEvent = events[index - 1];
        
        // If previous event is expired and we haven't stored the last price for this event yet
        if (previousEvent.status === 'expired' && !this.eventLastPrice.has(event.slug)) {
          // Store the current price as the last price (price when previous event ended)
          this.eventLastPrice.set(event.slug, this.currentPrice);
          // Re-render to show the last price
          this.renderEventsTable();
        }
      }
    });
  }

  private capturePriceForActiveEvent(): void {
    if (this.currentPrice === null) return;

    const events = this.eventManager.getEvents();
    const activeEvent = events.find(e => e.status === 'active');
    
    if (activeEvent) {
      // If we don't have a price to beat for this event yet, capture it
      if (!this.eventPriceToBeat.has(activeEvent.slug)) {
        this.eventPriceToBeat.set(activeEvent.slug, this.currentPrice);
        // Re-render active event to show the price
        this.renderActiveEvent();
      }
    }
  }

  private handleStatusChange(status: ConnectionStatus): void {
    this.currentStatus = status;
    this.updateUI();
  }

  private updatePriceDisplay(): void {
    const priceElement = document.getElementById('current-price');
    const timestampElement = document.getElementById('price-timestamp');
    const changeElement = document.getElementById('price-change');

    if (priceElement && this.currentPrice !== null) {
      priceElement.textContent = this.formatPrice(this.currentPrice);
      
      // Add animation class for price updates
      priceElement.classList.add('price-update');
      setTimeout(() => {
        priceElement.classList.remove('price-update');
      }, 300);
    }

    if (timestampElement && this.priceHistory.length > 0) {
      const lastUpdate = this.priceHistory[this.priceHistory.length - 1];
      timestampElement.textContent = new Date(lastUpdate.timestamp).toLocaleTimeString();
    }

    if (changeElement && this.priceHistory.length >= 2) {
      const current = this.priceHistory[this.priceHistory.length - 1].value;
      const previous = this.priceHistory[this.priceHistory.length - 2].value;
      const change = current - previous;
      const changePercent = ((change / previous) * 100).toFixed(4);

      changeElement.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent}%)`;
      changeElement.className = change >= 0 ? 'positive' : 'negative';
    }
  }

  private updateUI(): void {
    const statusElement = document.getElementById('connection-status');
    const errorElement = document.getElementById('error-message');
    
    if (statusElement) {
      const isConnected = this.currentStatus.connected;
      statusElement.textContent = isConnected ? 'Connected' : 'Disconnected';
      statusElement.className = isConnected ? 'status-connected' : 'status-disconnected';
    }

    if (errorElement) {
      errorElement.textContent = this.currentStatus.error || '';
    }
  }

  private formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  }

  private async loadEvents(): Promise<void> {
    try {
      await this.eventManager.loadEvents(10);
      
      // Update last prices when events are loaded
      this.updateLastPrices();
      
      this.renderEventsTable();
      // Clear any previous errors
      const errorElement = document.getElementById('events-error');
      if (errorElement) {
        errorElement.textContent = '';
      }
    } catch (error) {
      console.error('Error loading events:', error);
      const errorElement = document.getElementById('events-error');
      if (errorElement) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errorElement.textContent = `Failed to load events: ${errorMessage}`;
        errorElement.style.display = 'block';
      }
      
      // Still try to render with placeholder data if we have timestamps
      const timestamps = getNext15MinIntervals(10);
      if (timestamps.length > 0) {
        this.updateLastPrices();
        this.renderEventsTable();
      }
    }
  }

  private updateLastPrices(): void {
    if (this.currentPrice === null) return;

    const events = this.eventManager.getEvents();
    
    // For each event, if the previous event just expired, capture the price
    events.forEach((event, index) => {
      if (index > 0) {
        const previousEvent = events[index - 1];
        
        // If previous event is expired and we have a current price, store it as last price for this event
        if (previousEvent.status === 'expired' && !this.eventLastPrice.has(event.slug)) {
          // Use current price as the last price (price when previous event ended)
          this.eventLastPrice.set(event.slug, this.currentPrice);
        }
      }
    });
  }

  private formatCountdown(seconds: number): string {
    if (seconds <= 0) {
      return '00:00:00';
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  private updateCountdown(): void {
    const events = this.eventManager.getEvents();
    const activeEvent = events.find(e => e.status === 'active');
    const countdownElement = document.getElementById('event-countdown');
    
    if (!activeEvent || !countdownElement) {
      this.stopCountdown();
      return;
    }

    const endDate = new Date(activeEvent.endDate);
    const now = new Date();
    const timeLeft = Math.max(0, Math.floor((endDate.getTime() - now.getTime()) / 1000));
    
    countdownElement.textContent = this.formatCountdown(timeLeft);
    
    // If time is up, capture the price and refresh events to update status
    if (timeLeft === 0) {
      // Capture current price as last price for the next event
      if (this.currentPrice !== null) {
        const events = this.eventManager.getEvents();
        const activeEvent = events.find(e => e.status === 'active');
        if (activeEvent) {
          const activeIndex = events.findIndex(e => e.status === 'active');
          const nextEvent = events[activeIndex + 1];
          if (nextEvent && !this.eventLastPrice.has(nextEvent.slug)) {
            this.eventLastPrice.set(nextEvent.slug, this.currentPrice);
          }
        }
      }
      this.stopCountdown();
      this.loadEvents().catch(console.error);
    }
  }

  private startCountdown(): void {
    this.stopCountdown();
    this.countdownInterval = window.setInterval(() => {
      this.updateCountdown();
    }, 1000);
    // Update immediately
    this.updateCountdown();
  }

  private stopCountdown(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private renderActiveEvent(): void {
    const events = this.eventManager.getEvents();
    const activeEvent = events.find(e => e.status === 'active');
    const activeEventContainer = document.getElementById('active-event-display');
    
    if (!activeEventContainer) return;

    // Stop countdown if no active event
    if (!activeEvent) {
      this.stopCountdown();
      activeEventContainer.innerHTML = `
        <div class="active-event-empty">
          <p>No active event at the moment</p>
        </div>
      `;
      return;
    }

    // Get price to beat for this event
    const priceToBeat = this.eventPriceToBeat.get(activeEvent.slug);
    const priceToBeatDisplay = priceToBeat !== undefined 
      ? this.formatPrice(priceToBeat) 
      : (this.currentPrice !== null ? this.formatPrice(this.currentPrice) + ' (current)' : 'Loading...');

    // If we have a current price but no stored price to beat, capture it now
    if (priceToBeat === undefined && this.currentPrice !== null) {
      this.eventPriceToBeat.set(activeEvent.slug, this.currentPrice);
    }

    activeEventContainer.innerHTML = `
      <div class="active-event-content">
        <div class="active-event-header">
          <span class="active-event-badge">ACTIVE EVENT</span>
          <span class="active-event-status">LIVE</span>
        </div>
        <div class="active-event-title">${activeEvent.title}</div>
        <div class="active-event-countdown">
          <span class="countdown-label">Time Remaining:</span>
          <span class="countdown-value" id="event-countdown">--:--:--</span>
        </div>
        <div class="active-event-price-to-beat">
          <span class="price-to-beat-label">Price to Beat:</span>
          <span class="price-to-beat-value">${priceToBeatDisplay}</span>
        </div>
        <div class="active-event-details">
          <div class="active-event-detail-item">
            <span class="detail-label">Start:</span>
            <span class="detail-value">${activeEvent.formattedStartDate}</span>
          </div>
          <div class="active-event-detail-item">
            <span class="detail-label">End:</span>
            <span class="detail-value">${activeEvent.formattedEndDate}</span>
          </div>
        </div>
        <div class="active-event-info">
          <div class="info-row">
            <span class="info-label">Condition ID:</span>
            <span class="info-value">${activeEvent.conditionId || '--'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Question ID:</span>
            <span class="info-value">${activeEvent.questionId || '--'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">CLOB Token IDs:</span>
            <span class="info-value">${activeEvent.clobTokenIds ? activeEvent.clobTokenIds.join(', ') : '--'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Slug:</span>
            <span class="info-value slug-value">${activeEvent.slug}</span>
          </div>
        </div>
      </div>
    `;

    // Start countdown for active event
    this.startCountdown();
  }

  private renderEventsTable(): void {
    const events = this.eventManager.getEvents();
    const currentIndex = this.eventManager.getCurrentEventIndex();
    const tableBody = document.getElementById('events-table-body');
    
    if (!tableBody) return;

    // Capture price for newly active events
    this.capturePriceForActiveEvent();

    // Also update active event display
    this.renderActiveEvent();

    if (events.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">No events found</td></tr>';
      return;
    }

    tableBody.innerHTML = events.map((event, index) => {
      const isCurrent = index === currentIndex;
      const rowClass = isCurrent ? 'event-row current-event' : 'event-row';
      
      const statusClass = event.status === 'active' ? 'status-active' : 
                          event.status === 'expired' ? 'status-expired' : 'status-upcoming';
      const statusText = event.status === 'active' ? 'Active' : 
                        event.status === 'expired' ? 'Expired' : 'Upcoming';

      // Get last price for this event (from previous event's end)
      const lastPrice = this.eventLastPrice.get(event.slug) || event.lastPrice;
      const lastPriceDisplay = lastPrice !== undefined ? this.formatPrice(lastPrice) : '--';

      return `
        <tr class="${rowClass}">
          <td>${event.title}</td>
          <td>${event.formattedStartDate}</td>
          <td>${event.formattedEndDate}</td>
          <td><span class="${statusClass}">${statusText}</span></td>
          <td>${lastPriceDisplay}</td>
          <td>${event.conditionId || '--'}</td>
          <td>${event.questionId || '--'}</td>
          <td>${event.clobTokenIds ? event.clobTokenIds.join(', ') : '--'}</td>
          <td>${event.slug}</td>
        </tr>
      `;
    }).join('');
  }

  private render(): void {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
      <div class="container">
        <header>
          <h1>BTC/USD Streaming Platform</h1>
          <p class="subtitle">Real-time cryptocurrency price data from Polymarket</p>
        </header>

        <div class="controls">
          <div class="button-group">
            <button id="connect" class="btn btn-primary">Connect</button>
            <button id="disconnect" class="btn btn-secondary">Disconnect</button>
          </div>
        </div>

        <div class="status-bar">
          <div class="status-item">
            <span class="status-label">Status:</span>
            <span id="connection-status" class="status-disconnected">Disconnected</span>
          </div>
          <div id="error-message" class="error-message"></div>
        </div>

        <div class="price-display">
          <div class="price-label">Current Price</div>
          <div id="current-price" class="price-value">--</div>
          <div class="price-meta">
            <span>Last Update: <span id="price-timestamp">--</span></span>
            <span id="price-change" class="price-change">--</span>
          </div>
        </div>

        <div class="active-event-section" id="active-event-display">
          <div class="active-event-empty">
            <p>Loading events...</p>
          </div>
        </div>

        <div class="events-section">
          <h2>BTC Up/Down 15m Events</h2>
          <div id="events-error" class="error-message"></div>
          <div class="events-table-container">
            <table class="events-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Status</th>
                  <th>Price to Beat</th>
                  <th>Condition ID</th>
                  <th>Question ID</th>
                  <th>CLOB Token IDs</th>
                  <th>Slug</th>
                </tr>
              </thead>
              <tbody id="events-table-body">
                <tr>
                  <td colspan="9" style="text-align: center; padding: 20px;">Loading events...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="info-section">
          <h2>About</h2>
          <p>This platform streams real-time BTC/USD price data from Polymarket's Real-Time Data Socket (RTDS).</p>
          <p>The data is sourced from Chainlink oracle networks, providing reliable and accurate Bitcoin price information.</p>
        </div>
      </div>
    `;
  }
}

