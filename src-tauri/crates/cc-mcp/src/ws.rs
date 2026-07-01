//! WebSocket transport for the event bus, mirroring the pattern used by
//! binary-skyline's `/ws/metrics` endpoint: an axum `WebSocketUpgrade`
//! handler that forwards broadcast events matching the connection's current
//! subscription set, with a keepalive ping so idle connections don't get
//! reaped by proxies/NAT.

use std::time::Duration;

use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};

use crate::events::{EventBus, Subscriptions};

const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(30);

pub async fn ws_events_handler(
    ws: WebSocketUpgrade,
    State(bus): State<EventBus>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, bus))
}

async fn handle_socket(socket: WebSocket, bus: EventBus) {
    let (mut sender, mut receiver) = socket.split();
    let mut events = bus.subscribe();
    let mut subs = Subscriptions::default();
    let mut keepalive = tokio::time::interval(KEEPALIVE_INTERVAL);
    // `interval()`'s first tick fires immediately, not after the configured
    // duration -- consume it up front so a keepalive never races ahead of
    // real data on a fresh connection.
    keepalive.tick().await;

    loop {
        tokio::select! {
            inbound = receiver.next() => {
                let Some(Ok(message)) = inbound else { break };
                let Message::Text(text) = message else { continue };
                subs.apply(&text, &bus);
            }
            event = events.recv() => {
                let Ok(event) = event else { break };
                if !subs.contains(&event.topic) { continue; }
                let Ok(payload) = serde_json::to_string(&event) else { continue };
                if sender.send(Message::Text(payload)).await.is_err() { break; }
            }
            _ = keepalive.tick() => {
                if sender.send(Message::Ping(Vec::new())).await.is_err() { break; }
            }
        }
    }
}
