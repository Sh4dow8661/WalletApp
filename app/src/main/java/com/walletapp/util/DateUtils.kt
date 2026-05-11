package com.walletapp.util

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object DateUtils {

    private val dateFormat = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())
    private val dateTimeFormat = SimpleDateFormat("dd MMM yyyy HH:mm", Locale.getDefault())
    private val monthFormat = SimpleDateFormat("MMMM yyyy", Locale.getDefault())
    private val shortDateFormat = SimpleDateFormat("dd/MM", Locale.getDefault())
    private val isoDateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    private val isoDateTimeFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())

    fun formatDate(millis: Long): String = dateFormat.format(Date(millis))
    fun formatDateTime(millis: Long): String = dateTimeFormat.format(Date(millis))
    fun formatMonth(millis: Long): String = monthFormat.format(Date(millis))
    fun formatShort(millis: Long): String = shortDateFormat.format(Date(millis))
    fun formatIso(millis: Long): String = isoDateFormat.format(Date(millis))
    fun formatIsoDateTime(millis: Long): String = isoDateTimeFormat.format(Date(millis))

    fun startOfDay(millis: Long): Long {
        val cal = Calendar.getInstance().apply { timeInMillis = millis }
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }

    fun endOfDay(millis: Long): Long {
        val cal = Calendar.getInstance().apply { timeInMillis = millis }
        cal.set(Calendar.HOUR_OF_DAY, 23)
        cal.set(Calendar.MINUTE, 59)
        cal.set(Calendar.SECOND, 59)
        cal.set(Calendar.MILLISECOND, 999)
        return cal.timeInMillis
    }

    // Material3 DatePicker devuelve `selectedDateMillis` como medianoche UTC del día
    // elegido. Estos helpers traducen entre ese formato y la medianoche local que
    // usa el resto de la app — sin esto las fechas se corren un día en cualquier
    // huso horario distinto de UTC.
    fun pickerMillisToLocalStartOfDay(utcMillis: Long): Long {
        val utc = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { timeInMillis = utcMillis }
        return Calendar.getInstance().apply {
            clear()
            set(utc.get(Calendar.YEAR), utc.get(Calendar.MONTH), utc.get(Calendar.DAY_OF_MONTH), 0, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
    }

    fun pickerMillisToLocalEndOfDay(utcMillis: Long): Long =
        endOfDay(pickerMillisToLocalStartOfDay(utcMillis))

    fun localMillisToPickerMillis(localMillis: Long): Long {
        val local = Calendar.getInstance().apply { timeInMillis = localMillis }
        return Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
            clear()
            set(local.get(Calendar.YEAR), local.get(Calendar.MONTH), local.get(Calendar.DAY_OF_MONTH), 0, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
    }

    /** Returns [start, end] of the given month (epoch millis). */
    fun monthRange(year: Int, month: Int): Pair<Long, Long> {
        val cal = Calendar.getInstance()
        cal.clear()
        cal.set(year, month - 1, 1, 0, 0, 0)
        cal.set(Calendar.MILLISECOND, 0)
        val start = cal.timeInMillis
        cal.add(Calendar.MONTH, 1)
        cal.add(Calendar.MILLISECOND, -1)
        val end = cal.timeInMillis
        return start to end
    }

    fun currentMonth(): Pair<Int, Int> {
        val cal = Calendar.getInstance()
        return cal.get(Calendar.YEAR) to (cal.get(Calendar.MONTH) + 1)
    }

    fun monthRangeOfNow(): Pair<Long, Long> {
        val (y, m) = currentMonth()
        return monthRange(y, m)
    }

    fun addMonths(year: Int, month: Int, delta: Int): Pair<Int, Int> {
        val cal = Calendar.getInstance()
        cal.clear()
        cal.set(year, month - 1, 1)
        cal.add(Calendar.MONTH, delta)
        return cal.get(Calendar.YEAR) to (cal.get(Calendar.MONTH) + 1)
    }

    fun daysInMonth(year: Int, month: Int): Int {
        val cal = Calendar.getInstance()
        cal.clear()
        cal.set(year, month - 1, 1)
        return cal.getActualMaximum(Calendar.DAY_OF_MONTH)
    }

    fun firstDayOfWeekOfMonth(year: Int, month: Int): Int {
        val cal = Calendar.getInstance()
        cal.clear()
        cal.set(year, month - 1, 1)
        // Convert Sunday=1..Saturday=7 to Monday=0..Sunday=6
        val dow = cal.get(Calendar.DAY_OF_WEEK)
        return ((dow + 5) % 7)
    }

    fun dayStart(year: Int, month: Int, day: Int): Long {
        val cal = Calendar.getInstance()
        cal.clear()
        cal.set(year, month - 1, day, 0, 0, 0)
        cal.set(Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }

    fun monthName(month: Int): String {
        val cal = Calendar.getInstance()
        cal.set(Calendar.MONTH, month - 1)
        return SimpleDateFormat("MMMM", Locale.getDefault()).format(cal.time)
    }

    fun yearMonthLabel(year: Int, month: Int): String {
        val cal = Calendar.getInstance()
        cal.clear()
        cal.set(year, month - 1, 1)
        return monthFormat.format(cal.time).replaceFirstChar { it.uppercase() }
    }
}
