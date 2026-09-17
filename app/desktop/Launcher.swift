import AppKit

final class TAPDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var server: Process?
    var address: URL?
    var buffer = ""
    let status = NSTextField(wrappingLabelWithString: "Lokalen Server starten …")
    let openButton = NSButton(title: "Im Browser öffnen", target: nil, action: nil)
    var quitting = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        let appMenu = NSMenu()
        let item = NSMenuItem(); appMenu.addItem(item)
        let menu = NSMenu(); menu.addItem(withTitle: "TAP beenden", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = menu; NSApp.mainMenu = appMenu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 390), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "TAP"; window.delegate = self; window.center(); window.isReleasedWhenClosed = false
        window.appearance = NSAppearance(named: .darkAqua)
        let stack = NSStackView(); stack.orientation = .vertical; stack.spacing = 14; stack.alignment = .centerX
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([stack.centerXAnchor.constraint(equalTo: window.contentView!.centerXAnchor), stack.centerYAnchor.constraint(equalTo: window.contentView!.centerYAnchor), stack.widthAnchor.constraint(equalToConstant: 390)])
        let icon = NSImageView(); icon.image = NSImage(named: NSImage.Name("AppIcon")) ?? NSApp.applicationIconImage
        icon.setFrameSize(NSSize(width: 96, height: 96)); icon.widthAnchor.constraint(equalToConstant: 96).isActive = true; icon.heightAnchor.constraint(equalToConstant: 96).isActive = true
        stack.addArrangedSubview(icon)
        let title = NSTextField(labelWithString: "TAP"); title.font = .systemFont(ofSize: 30, weight: .bold); stack.addArrangedSubview(title)
        let subtitle = NSTextField(labelWithString: "Tactical Animation Planner"); subtitle.textColor = .secondaryLabelColor; stack.addArrangedSubview(subtitle)
        status.alignment = .center; status.font = .monospacedSystemFont(ofSize: 11, weight: .regular); stack.addArrangedSubview(status)
        openButton.target = self; openButton.action = #selector(openBrowser); openButton.bezelStyle = .rounded; openButton.isEnabled = false
        stack.addArrangedSubview(openButton)
        let quit = NSButton(title: "TAP beenden", target: NSApp, action: #selector(NSApplication.terminate(_:))); quit.bezelStyle = .rounded; stack.addArrangedSubview(quit)
        let hint = NSTextField(wrappingLabelWithString: "Schliessen blendet dieses Fenster aus. TAP läuft weiter; über das Dock erneut öffnen. „TAP beenden“ stoppt die App. Chrome / Edge für Videoexport empfohlen."); hint.alignment = .center; hint.font = .systemFont(ofSize: 11); hint.textColor = .secondaryLabelColor; stack.addArrangedSubview(hint)
        window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        startServer()
    }
    func startServer() {
        guard let executable = Bundle.main.url(forResource: "tap-server", withExtension: nil) else { status.stringValue = "TAP-Paket unvollständig: Server fehlt."; return }
        let process = Process(); process.executableURL = executable
        process.arguments = ["--no-open", "--parent", String(ProcessInfo.processInfo.processIdentifier)]
        let pipe = Pipe(); process.standardOutput = pipe; process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil; return }
            guard let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async { self?.receive(text) }
        }
        process.terminationHandler = { [weak self] p in DispatchQueue.main.async {
            guard let self = self, !self.quitting else { return }
            if p.terminationStatus != 0 || self.address == nil { self.status.stringValue = "Server beendet. Bitte TAP neu öffnen."; self.openButton.isEnabled = false }
        } }
        do { try process.run(); server = process } catch { status.stringValue = "Start fehlgeschlagen: \(error.localizedDescription)" }
    }
    func receive(_ text: String) {
        buffer += text
        while let newline = buffer.firstIndex(of: "\n") {
            let line = String(buffer[..<newline]); buffer = String(buffer[buffer.index(after: newline)...])
            if line.hasPrefix("TAP_URL=") || line.hasPrefix("TAP_REUSED=") {
                address = URL(string: String(line.split(separator: "=", maxSplits: 1)[1]))
                status.stringValue = "Läuft lokal · \(address!.absoluteString)"; openButton.isEnabled = true
                if ProcessInfo.processInfo.environment["TAP_LAUNCHER_SMOKE"] == "1" {
                    print("TAP_LAUNCHER_READY=\(address!.absoluteString)")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { NSApp.terminate(nil) }
                } else { openBrowser() }
            }
        }
    }
    @objc func openBrowser() {
        guard let url = address else { return }
        let workspace = NSWorkspace.shared
        let browser = ["com.google.Chrome", "com.microsoft.edgemac"].compactMap { workspace.urlForApplication(withBundleIdentifier: $0) }.first
        if let browser = browser { workspace.open([url], withApplicationAt: browser, configuration: NSWorkspace.OpenConfiguration()) }
        else { workspace.open(url) }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { sender.orderOut(nil); return false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
    func applicationWillTerminate(_ notification: Notification) { quitting = true; if server?.isRunning == true { server?.terminate() } }
}
let app = NSApplication.shared
let delegate = TAPDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
