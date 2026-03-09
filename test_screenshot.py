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

        # Wait a bit for Three.js to render
        page.wait_for_timeout(1000)
        page.screenshot(path='screenshot_initial.png')

        # Test "大" button
        page.click('#btn-large')
        page.wait_for_timeout(500)
        page.screenshot(path='screenshot_large.png')

        # Test "小" button
        page.click('#btn-small')
        page.click('#btn-small')
        page.wait_for_timeout(500)
        page.screenshot(path='screenshot_small.png')

        browser.close()

run()
