package com.walletapp.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalDensity

data class BarEntry(val label: String, val value: Double)

@Composable
fun BarChartView(
    entries: List<BarEntry>,
    modifier: Modifier = Modifier,
    barColor: Color = MaterialTheme.colorScheme.primary
) {
    if (entries.isEmpty() || entries.all { it.value == 0.0 }) {
        Box(
            modifier = modifier.fillMaxWidth().height(200.dp),
            contentAlignment = Alignment.Center
        ) { Text("Sin datos", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        return
    }

    val density = LocalDensity.current
    val textColor = MaterialTheme.colorScheme.onSurface
    val axisColor = MaterialTheme.colorScheme.onSurfaceVariant

    Column(modifier = modifier.fillMaxWidth().padding(16.dp)) {
        Canvas(
            modifier = Modifier.fillMaxWidth().height(200.dp)
        ) {
            val maxValue = entries.maxOf { it.value }.takeIf { it > 0 } ?: 1.0
            val barWidthRatio = 0.6f
            val leftPadding = 40f
            val bottomPadding = 40f
            val chartWidth = size.width - leftPadding
            val chartHeight = size.height - bottomPadding
            val slotWidth = chartWidth / entries.size
            val barWidth = slotWidth * barWidthRatio

            // Y axis
            drawLine(
                color = axisColor,
                start = Offset(leftPadding, 0f),
                end = Offset(leftPadding, chartHeight),
                strokeWidth = 2f
            )
            // X axis
            drawLine(
                color = axisColor,
                start = Offset(leftPadding, chartHeight),
                end = Offset(size.width, chartHeight),
                strokeWidth = 2f
            )

            val labelSizePx = with(density) { 10.sp.toPx() }
            val labelPaint = android.graphics.Paint().apply {
                color = textColor.toArgb()
                textSize = labelSizePx
                isAntiAlias = true
            }

            entries.forEachIndexed { index, entry ->
                val normalized = (entry.value / maxValue).toFloat()
                val barHeight = chartHeight * normalized
                val x = leftPadding + slotWidth * index + (slotWidth - barWidth) / 2
                val y = chartHeight - barHeight
                drawRect(
                    color = barColor,
                    topLeft = Offset(x, y),
                    size = Size(barWidth, barHeight)
                )
                drawContext.canvas.nativeCanvas.drawText(
                    entry.label,
                    x + barWidth / 2 - entry.label.length * labelSizePx / 4,
                    chartHeight + bottomPadding / 2 + labelSizePx / 2,
                    labelPaint
                )
            }
        }
    }
}

