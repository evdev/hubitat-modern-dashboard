/**
 * Virtual Notification — Modern Dashboard companion driver
 *
 * Receives Hubitat Notification capability messages (Rule Machine, HSM, apps)
 * for display as popups on the Modern Dashboard PWA.
 *
 * Setup (recommended):
 *   1. Install Modern Dashboard via Hubitat Package Manager (installs this driver).
 *   2. Apps → Modern Dashboard → Notifications → Create Virtual Notification device.
 *   3. Target that device from Rule Machine or other apps (Send Notification).
 *
 * Manual driver install: Drivers Code → New Driver → paste → Save, then use the
 * in-app Create button above (or Devices → Add Virtual Device → Virtual Notification).
 */

metadata {
    definition(
        name: "Virtual Notification",
        namespace: "mDash",
        author: "Ephrayim (evdev)",
        importUrl: "https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/beta/dist/drivers/VirtualNotification.groovy"
    ) {
        capability "Notification"
        capability "Actuator"

        attribute "notificationText", "string"
        attribute "lastMessage", "string"
    }

    preferences {
        input name: "txtEnable", type: "bool", title: "Enable descriptionText logging", defaultValue: true
    }
}

void installed() {
    log.info "Virtual Notification installed"
}

void updated() {
    log.info "Virtual Notification updated"
}

void deviceNotification(String text) {
    String msg = (text == null) ? "" : text.toString()
    if (msg.length() > 1024) msg = msg.substring(0, 1024)
    if (txtEnable) log.info "deviceNotification: ${msg}"
    // One subscriber-visible event only. Emitting lastMessage as a second isStateChange
    // event would enqueue the same popup twice in Modern Dashboard.
    sendEvent(name: "notificationText", value: msg, isStateChange: true, descriptionText: msg)
    sendEvent(name: "lastMessage", value: msg, isStateChange: false, displayed: false)
}
