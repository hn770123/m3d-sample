from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={'width': 390, 'height': 844},
            device_scale_factor=3,
            is_mobile=True,
            has_touch=True
        )
        page.goto('http://localhost:8000/')

        # Test "速" button
        page.click('#btn-fast')
        page.wait_for_timeout(500)

        # Test "遅" button
        page.click('#btn-slow')
        page.wait_for_timeout(500)

        browser.close()

run()
