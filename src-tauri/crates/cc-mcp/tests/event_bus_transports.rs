//! End-to-end proof that both transports actually deliver events, not just
//! compile: real WebSocket and WebTransport clients connect, subscribe,
//! and receive a published event over the wire.

use cc_mcp::EventBus;

#[tokio::test]
async fn websocket_delivers_subscribed_events() {
    let bus = EventBus::default();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    drop(listener);

    let server_bus = bus.clone();
    tokio::spawn(async move {
        let _ = cc_mcp::serve::serve_http_with_bus("127.0.0.1", addr.port(), server_bus).await;
    });
    wait_for_port(addr.port()).await;

    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/ws/events"))
        .await
        .expect("client connects");

    use futures_util::{SinkExt, StreamExt};
    ws.send(tokio_tungstenite::tungstenite::Message::Text(
        r#"{"type":"subscribe","topic":"test"}"#.into(),
    ))
    .await
    .unwrap();

    // Give the server a moment to process the subscribe before publishing,
    // otherwise the event could race ahead of the subscription.
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    bus.publish("test", serde_json::json!({"hello": "world"}));
    bus.publish("other-topic", serde_json::json!({"ignored": true}));

    let msg = tokio::time::timeout(std::time::Duration::from_secs(5), ws.next())
        .await
        .expect("did not time out")
        .expect("stream not closed")
        .expect("no error");
    let text = msg.into_text().unwrap();
    let event: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(event["topic"], "test");
    assert_eq!(event["data"]["hello"], "world");
}

#[tokio::test]
async fn webtransport_delivers_subscribed_events() {
    let bus = EventBus::default();
    let port = pick_udp_port();

    let server_bus = bus.clone();
    tokio::spawn(async move {
        let _ = cc_mcp::serve_webtransport("127.0.0.1", port, server_bus, None).await;
    });
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let client_config = wtransport::ClientConfig::builder()
        .with_bind_default()
        .with_no_cert_validation()
        .build();
    let connection = wtransport::Endpoint::client(client_config)
        .expect("client endpoint")
        .connect(format!("https://127.0.0.1:{port}"))
        .await
        .expect("session established");

    let (mut send, recv) = connection.open_bi().await.unwrap().await.unwrap();
    send.write_all(b"{\"type\":\"subscribe\",\"topic\":\"test\"}\n")
        .await
        .unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    bus.publish("test", serde_json::json!({"hello": "quic"}));

    use tokio::io::{AsyncBufReadExt, BufReader};
    let mut lines = BufReader::new(recv).lines();
    let line = tokio::time::timeout(std::time::Duration::from_secs(5), lines.next_line())
        .await
        .expect("did not time out")
        .expect("no io error")
        .expect("stream not closed");
    let event: serde_json::Value = serde_json::from_str(&line).unwrap();
    assert_eq!(event["topic"], "test");
    assert_eq!(event["data"]["hello"], "quic");
}

async fn wait_for_port(port: u16) {
    for _ in 0..50 {
        if tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .is_ok()
        {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    panic!("server on port {port} never came up");
}

fn pick_udp_port() -> u16 {
    let socket = std::net::UdpSocket::bind("127.0.0.1:0").unwrap();
    socket.local_addr().unwrap().port()
}
