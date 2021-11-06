// ==UserScript==
// @name         Aliexpress shipping getter
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Получает цену доставки на указанные страны
// @author       Andronio
// @homepage     https://github.com/Andronio2/Aliexpress-shipping-getter
// @supportURL   https://github.com/Andronio2/Aliexpress-shipping-getter
// @updateURL    https://github.com/Andronio2/Aliexpress-shipping-getter/raw/main/Aliexpress%20shipping%20getter.user.js
// @downloadURL  https://github.com/Andronio2/Aliexpress-shipping-getter/raw/main/Aliexpress%20shipping%20getter.user.js
// @match        https://aliexpress.com/item/*
// @match        https://www.aliexpress.com/item/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
let shipping_getter_count = 10;
(function repeat() {
    'use strict';
/*
 * Настройки
 */

let myCountry = ["KZ", "RU"];
let fromCountry = [ "CN", "RU"];  // Страны "откуда" в порядке предпочтения
let serviceName = 1;              // 1 - название, 0 - код сервиса
/*
 * Дальше не трогать
 */
    if (--shipping_getter_count == 0) return console.log("Не смог найти доставку");
    let shipping = document.querySelector('.Product_Service__freightService__v5uaj, .Product_NewFreight__extraInfoDetail__3k9ff, .freight-extra-info, .product-shipping-info, .product-dynamic-shipping');;
    if (!shipping) return setTimeout(repeat, 1000);
    let item = location.pathname.match(/\d+(?=\.html)/);
    let host = location.host;
    let skuProp = window.runParams.data.skuModule;
    let freightMass = window.runParams.data.skuModule.skuPriceList.slice();
    let foundCountry = false;
    if (skuProp.hasOwnProperty("productSKUPropertyList")) {
        fromCountry.some(country => {                   // Если есть хоть одна проперти, то смотрим
            let propIndex = skuProp.productSKUPropertyList.findIndex( el => el.skuPropertyId === 200007763);        // Ищем проперти "отправка из"
            if (propIndex != -1) {
                let countryIndex = skuProp.productSKUPropertyList[propIndex].skuPropertyValues.findIndex( el => el.skuPropertySendGoodsCountryCode == country) // Ищем нужную страну
                if (countryIndex != -1) {
                    let countryCode = skuProp.productSKUPropertyList[propIndex].skuPropertyValues[countryIndex].propertyValueId; // Код страны
                    let mass = freightMass.filter( el => (el.skuPropIds.split(',').some(pr => +pr == countryCode) && el.skuVal.availQuantity > 0)); // ищем элементы нужной страны и на складе > 0
                    if (mass.length > 0) {
                        freightMass = mass;
                        foundCountry = country;
                        return true;
                    }
                }
            }
        })
    }
    freightMass.sort( (a,b) => a.skuVal.actSkuCalPrice - b.skuVal.actSkuCalPrice);
    let minPrice = encodeURIComponent(freightMass[0].freightExt);
    let requests = myCountry.map(el => {
        return fetch(`https://${host}/aeglodetailweb/api/logistics/freight?productId=${item}&count=1&minPrice=${freightMass[0].skuVal.actSkuCalPrice}&maxPrice=${freightMass[freightMass.length - 1].skuVal.actSkuCalPrice}&country=${el}&tradeCurrency=USD&userScene=PC_DETAIL&ext=${minPrice}`, {
            "headers": {
                "accept": "application/json, text/plain, */*",
                "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            },
            "referrer": `https://${host}/item/${item}.html`,
            "referrerPolicy": "no-referrer-when-downgrade",
            "body": null,
            "method": "GET",
            "credentials": "include"
        });
    });
    Promise.all(requests)
        .then(responses => Promise.all(responses.map(r => r.json())))
        .then(freight => {
        freight.forEach(obj => {
            if (obj.body.hasOwnProperty("freightResult")) {
                obj.body.freightResult.sort( (a,b) => a.freightAmount.value - b.freightAmount.value);
            }
            return obj;
        });
        let div = document.createElement('div');
        div.className = "table-shipping";
        let str = '<table border="1">';
        for (let i = 0; i < myCountry.length; i++) {
            if (freight[i].body.hasOwnProperty("freightResult") && freight[i].body.freightResult.filter( el => !foundCountry ? true: el.sendGoodsCountry == foundCountry).length > 0) {
                let freeSh = freight[i].body.freightResult.filter( el => el.freightAmount.value == 0 && (!foundCountry ? true: el.sendGoodsCountry == foundCountry));
                if (freeSh.length == 0) {
// Если нет бесплатной доставки
                    let str2 = freight[i].body.freightResult[0].freightAmount.formatedAmount;
                    let str3 = serviceName ? freight[i].body.freightResult[0].company : freight[i].body.freightResult[0].serviceName;
                    str += `<tr><td>${myCountry[i]}</td><td>${str2}</td><td>${str3}</td></tr>`;
                } else {
// Бесплатная доставка
                    freeSh.forEach( (el, index) => {
                        let str3 = serviceName ? el.company : el.serviceName;
                        str += index ? `<tr><td style="background:lightgreen">Free</td><td>${str3}</td></tr>` : `<tr><td rowspan=${freeSh.length}>${myCountry[i]}</td><td style="background:lightgreen">Free</td><td>${str3}</td></tr>`;
                    });
                }
            } else {
                str += `<tr><td>${myCountry[i]}</td><td colspan=2 style="background:OrangeRed">---</td></tr>`;
            }
        }
        div.innerHTML = str + '</table>';
        shipping.after(div);

        let styles = `
            .table-shipping table{
                border-collapse: collapse;
            }
            .table-shipping td{
                padding: 1px 20px;
            }`;

        let styleSheet = document.createElement('style');
        styleSheet.type = "text/css";
        styleSheet.innerHTML = styles;
        document.head.append(styleSheet);
    });
})();
