package com.isitworthit.app.ui

import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Currency
import java.util.Locale

// Matches the web UI (frontend/src/lib/format.ts): euros, German number format.
private val locale = Locale.GERMANY
private val euro = NumberFormat.getCurrencyInstance(locale).apply { currency = Currency.getInstance("EUR") }
private val number = NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = 1 }
private val dateFormat = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)

fun money(cents: Int?): String = if (cents == null) "–" else euro.format(cents / 100.0)
fun perHour(cents: Int?): String = if (cents == null) "–" else "${money(cents)}/h"
fun hours(h: Double?): String = if (h == null) "–" else "${number.format(h)} h"
fun date(iso: String?): String = iso?.let {
    runCatching { LocalDate.parse(it.take(10)).format(dateFormat) }.getOrDefault(it)
} ?: "–"
