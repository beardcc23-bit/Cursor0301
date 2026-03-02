#!/usr/bin/env python3
"""
ChatGPT 分享連結爬蟲 — 使用 Selenium 取得對話內容並輸出為 Markdown。
"""

from __future__ import annotations

import os
import re
import time
from pathlib import Path

# 將 ChromeDriver 快取放在專案內，避免寫入 ~/.wdm
_crawler_dir = Path(__file__).resolve().parent
os.environ.setdefault("WDM_LOCAL", "1")
os.environ.setdefault("WDM_DRIVER_CACHE_PATH", str(_crawler_dir / ".wdm"))

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager


URL = "https://chatgpt.com/s/t_68d21677946081918576092e1c2d37c1"
RENDER_WAIT_SEC = 5
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"


def sanitize_filename(title: str) -> str:
    """將網頁標題轉成合法檔名。"""
    s = re.sub(r'[<>:"/\\|?*]', "", title)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:100] if s else "chatgpt_export"


def get_driver():
    """建立 headless Chrome driver。"""
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1920,1080")
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=opts)


def extract_via_data_role(driver) -> list[tuple[str, str]]:
    """用 data-message-author-role 抓訊息。"""
    messages = []
    blocks = driver.find_elements(By.CSS_SELECTOR, "[data-message-author-role]")
    for el in blocks:
        role = el.get_attribute("data-message-author-role") or ""
        role = "user" if role == "user" else "assistant"
        text = el.text.strip()
        if text:
            messages.append((role, text))
    return messages


def extract_via_articles(driver) -> list[tuple[str, str]]:
    """用 article 或常見的訊息區塊選取器當備援。"""
    messages = []
    # 常見：每則訊息在 article 或 div 裡，偶爾有 role 在父層
    candidates = driver.find_elements(By.CSS_SELECTOR, "article, [class*='message'], [class*='Message']")
    for el in candidates:
        text = el.text.strip()
        if not text or len(text) < 2:
            continue
        # 簡單啟發：開頭像在回覆的當 assistant
        if "report-content" in (el.get_attribute("href") or "") or "Terms" in text:
            continue
        role = "assistant"  # 預設
        if el.get_attribute("data-message-author-role") == "user":
            role = "user"
        messages.append((role, text))
    return messages


def extract_via_react_state(driver) -> list[tuple[str, str]]:
    """嘗試從 React Router loader 資料取對話（若頁面有注入）。"""
    script = """
    try {
        var state = window.__reactRouterDataRouter?.state?.loaderData;
        if (!state) return null;
        var data = Object.values(state).find(function(x) {
            return x && (x.conversation || x.messages || x.chat);
        });
        if (!data) return null;
        var conv = data.conversation || data.chat || data;
        var messages = conv.messages || conv.mapping || [];
        if (!Array.isArray(messages)) messages = Object.values(messages || {});
        return messages.map(function(m) {
            var role = (m.author && m.author.role) || m.role || (m.message && m.message.author && m.message.author.role) || 'assistant';
            var text = (m.text || (m.message && m.message.text) || (m.content && m.content.parts && m.content.parts[0].text) || '').trim();
            if (typeof text !== 'string' && text && text.text) text = text.text;
            return { role: role, text: text };
        }).filter(function(x) { return x && x.text; });
    } catch (e) { return null; }
    """
    raw = driver.execute_script(script)
    if not raw:
        return []
    result = []
    for m in raw:
        role = (m.get("role") or "assistant").lower()
        if "user" not in role:
            role = "assistant"
        else:
            role = "user"
        result.append((role, (m.get("text") or "").strip()))
    return result


def _normalize_text(t: str) -> str:
    return re.sub(r"\s+", " ", t.strip())


def dedupe_messages(messages: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """移除重複訊息；若同 role 且內容其一為另一子字串則保留較長者。"""
    out: list[tuple[str, str]] = []
    for role, text in messages:
        norm = _normalize_text(text)
        merged = False
        for i, (r, t) in enumerate(out):
            if r != role:
                continue
            n = _normalize_text(t)
            if norm in n:
                merged = True
                break
            if n in norm:
                out[i] = (role, text)
                merged = True
                break
        if not merged:
            out.append((role, text))
    return out


def format_message_content(text: str) -> str:
    """將單則訊息內容格式化成易讀 Markdown（段落、列表標題等）。"""
    text = text.strip()
    if not text:
        return ""
    lines = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            lines.append("")
            continue
        # 「👉 優點：」「🎬 融合版...」等小標題改為 ###
        if re.match(r"^[👉►•]\s*.+[：:]$", line) or re.match(r"^[🎬].+[：:]$", line):
            lines.append("")
            title = line.lstrip("👉►•🎬 ").strip()
            lines.append(f"### {title}" if title else line)
            continue
        # 列點（以 - 或 • 開頭）
        if re.match(r"^[-•]\s+", line):
            lines.append(line)
            continue
        lines.append(line)
    return "\n\n".join(p for p in "\n".join(lines).split("\n\n") if p.strip())


def to_markdown(messages: list[tuple[str, str]], page_title: str) -> str:
    """將對話串轉成易讀的 Markdown。"""
    lines = [
        f"# {page_title}",
        "",
        "> 來源：ChatGPT 分享連結匯出",
        "",
        "---",
        "",
    ]
    for role, text in messages:
        heading = "## 👤 使用者" if role == "user" else "## 🤖 ChatGPT"
        body = format_message_content(text)
        block = [heading, "", body, ""]
        lines.extend(block)
    return "\n".join(lines).strip() + "\n"


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    driver = get_driver()
    try:
        driver.get(URL)
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
        time.sleep(RENDER_WAIT_SEC)

        page_title = driver.title.strip() or "ChatGPT 對話匯出"
        # 若標題是 "ChatGPT - xxx" 只保留副標
        if page_title.startswith("ChatGPT - "):
            page_title = page_title.replace("ChatGPT - ", "", 1).strip()

        messages = extract_via_data_role(driver)
        if not messages:
            messages = extract_via_react_state(driver)
        if not messages:
            messages = extract_via_articles(driver)

        if not messages:
            # 最後手段：抓 main 或主要內容區的段落
            for sel in ["main", "[role='main']", ".markdown"]:
                try:
                    root = driver.find_element(By.CSS_SELECTOR, sel)
                    messages = [("assistant", root.text.strip())]
                    if messages[0][1]:
                        break
                except Exception:
                    continue

        messages = dedupe_messages(messages)
        md = to_markdown(messages, page_title)
        filename = sanitize_filename(page_title) + ".md"
        out_path = OUTPUT_DIR / filename
        out_path.write_text(md, encoding="utf-8")
        print(f"已寫入：{out_path}")
        print(f"共 {len(messages)} 則訊息")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
