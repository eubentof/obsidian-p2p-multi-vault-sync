import { App, Modal, Notice, Setting } from "obsidian";
import type { QrConnection } from "../core/qr-pairing";
import { qrConnectionUrl } from "../core/qr-pairing";

/** The URI arrives in the open vault. Confirm that vault before saving. */
export class QrConnectModal extends Modal {
  private busy = false;

  constructor(
    app: App,
    private connection: QrConnection,
    private connect: (connection: QrConnection) => Promise<boolean>
  ) {
    super(app);
    this.setTitle("Connect this vault to Obsync");
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      text: `Mobile vault: ${this.app.vault.getName()}`,
    });
    this.contentEl.createEl("p", {
      text: `Desktop server: ${this.connection.host}:${this.connection.port}`,
    });
    this.contentEl.createEl("p", {
      text: `Expected desktop fingerprint: ${this.connection.fingerprint}`,
    });
    this.contentEl.createEl("p", {
      text: "Only connect if this is the mobile vault you want to synchronize. The desktop must still approve this device.",
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Connect this vault").setCta().onClick(async () => {
        if (this.busy) return;
        this.busy = true;
        button.setDisabled(true);
        try {
          if (await this.connect(this.connection)) this.close();
        } catch (error) {
          new Notice(`Obsync connection failed: ${error instanceof Error ? error.message : error}`);
        } finally {
          this.busy = false;
          button.setDisabled(false);
        }
      }))
      .addButton((button) => button.setButtonText("Different vault").onClick(() => {
        void navigator.clipboard?.writeText(qrConnectionUrl(this.connection));
        new Notice("Switch to the intended mobile vault, then scan the QR code again. The link was also copied to your clipboard where supported.", 8000);
        this.close();
      }));
  }
}
