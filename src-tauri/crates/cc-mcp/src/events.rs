//! Shared pub/sub event bus for the WebSocket and WebTransport servers.
//!
//! One process-wide `tokio::sync::broadcast` channel carries every event
//! regardless of topic; each connection keeps its own set of subscribed
//! topics and filters the broadcast stream client-side. That keeps the
//! subscribe/unsubscribe protocol identical for both transports -- neither
//! `ws.rs` nor `webtransport.rs` needs to know about the other's connection
//! bookkeeping, they just call `EventBus::subscribe()` and filter.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

const CHANNEL_CAPACITY: usize = 256;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Event {
    pub topic: String,
    pub data: serde_json::Value,
}

/// Message a client sends to manage its subscription set.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Subscribe { topic: String },
    Unsubscribe { topic: String },
}

#[derive(Clone)]
pub struct EventBus {
    tx: broadcast::Sender<Event>,
}

impl Default for EventBus {
    fn default() -> Self {
        let (tx, _rx) = broadcast::channel(CHANNEL_CAPACITY);
        Self { tx }
    }
}

impl EventBus {
    pub fn publish(&self, topic: impl Into<String>, data: serde_json::Value) {
        // No receivers is not an error -- events are fire-and-forget for
        // whoever happens to be subscribed at the time.
        let _ = self.tx.send(Event {
            topic: topic.into(),
            data,
        });
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Event> {
        self.tx.subscribe()
    }
}

/// Per-connection subscription set, shared by the WS and WebTransport
/// handlers. `apply` mutates the set in place and returns whether the
/// message was well-formed (callers decide whether a bad message should
/// close the connection or just be ignored).
#[derive(Default)]
pub struct Subscriptions(HashSet<String>);

impl Subscriptions {
    pub fn apply(&mut self, raw: &str) -> bool {
        let Ok(msg) = serde_json::from_str::<ClientMessage>(raw) else {
            return false;
        };
        match msg {
            ClientMessage::Subscribe { topic } => {
                self.0.insert(topic);
            }
            ClientMessage::Unsubscribe { topic } => {
                self.0.remove(&topic);
            }
        }
        true
    }

    pub fn contains(&self, topic: &str) -> bool {
        self.0.contains(topic)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn subscriber_only_sees_subscribed_topics() {
        let bus = EventBus::default();
        let mut rx = bus.subscribe();
        let mut subs = Subscriptions::default();
        assert!(subs.apply(r#"{"type":"subscribe","topic":"a"}"#));

        bus.publish("a", serde_json::json!({"n": 1}));
        bus.publish("b", serde_json::json!({"n": 2}));
        bus.publish("a", serde_json::json!({"n": 3}));

        let mut seen = Vec::new();
        for _ in 0..3 {
            let event = rx.recv().await.unwrap();
            if subs.contains(&event.topic) {
                seen.push(event.data["n"].as_i64().unwrap());
            }
        }
        assert_eq!(seen, vec![1, 3]);

        assert!(subs.apply(r#"{"type":"unsubscribe","topic":"a"}"#));
        assert!(!subs.contains("a"));
    }

    #[test]
    fn malformed_message_is_rejected() {
        let mut subs = Subscriptions::default();
        assert!(!subs.apply("not json"));
        assert!(!subs.apply(r#"{"type":"nonsense"}"#));
    }
}
