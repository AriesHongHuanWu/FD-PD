/**
 * Logger Module
 * Handles recording and retrieval of system events.
 */
import { UI } from './ui.js';

export const Logger = {
    logs: [],
    maxLogs: 50,

    add(type, message, details = null) {
        const timestamp = new Date();
        const event = {
            id: Date.now(),
            time: timestamp.toLocaleTimeString(),
            type: type, // 'info', 'warning', 'error', 'success'
            message: message,
            details: details
        };

        this.logs.unshift(event);
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }

        UI.addLogEntry(event);

        // Auto-save important events?
        if (type === 'error') {
            this.saveToStorage();
        }
    },

    saveToStorage() {
        try {
            localStorage.setItem('fallguard_logs', JSON.stringify(this.logs));
        } catch (e) {
            console.error('Failed to save logs', e);
        }
    },

    export() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.logs, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "fallguard_logs.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
};

window.exportLogs = () => Logger.export();
