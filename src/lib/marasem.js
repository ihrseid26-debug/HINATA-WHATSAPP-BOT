const DEFAULTS = {
  welcome: {
    enabled: false,
    text: 'أهلًا وسهلًا بك {user} في مجموعة {group} 🍹',
    image: '',
    video: '',
    mention: true,
    title: '❄️ عضو جديد انضم إلينا',
    footer: 'نتمنى لك وقتًا ممتعًا معنا'
  },
  goodbye: {
    enabled: false,
    text: 'غادر {user} مجموعة {group}. نتمنى لك التوفيق 🍹',
    image: '',
    video: '',
    mention: true,
    title: '👋 وداعًا',
    footer: 'نراك على خير'
  }
};

function getInput(ctx) {
  return Array.isArray(ctx.args) ? ctx.args.join(' ').trim() : '';
}

function render(template, user, group, count) {
  return String(template || '')
    .replaceAll('{user}', '@' + user.split('@')[0])
    .replaceAll('{group}', group || 'المجموعة')
    .replaceAll('{count}', String(count ?? 'غير معروف'));
}

function groupOnly(ctx) {
  return typeof ctx.jid === 'string' && ctx.jid.endsWith('@g.us');
}

async function save(ctx, section, patch) {
  const current = await ctx.settingsStore.get(ctx.jid);
  const old = current.marasem || {};
  const next = {
    welcome: { ...DEFAULTS.welcome, ...(old.welcome || {}) },
    goodbye: { ...DEFAULTS.goodbye, ...(old.goodbye || {}) }
  };
  next[section] = { ...next[section], ...patch };
  await ctx.settingsStore.setMarasem(ctx.jid, next);
  return next[section];
}

function sectionLabel(section) {
  return section === 'welcome' ? 'الترحيب' : 'الوداع';
}

export function registerMarasemCommands(commands) {
  const add = (name, description, handler) => {
    commands.set(name, {
      description,
      requiresAdmin: true,
      reaction: '❄️',
      handler: async ctx => {
        if (!groupOnly(ctx)) {
          await ctx.reply('⛔ هذا الأمر يعمل داخل المجموعات فقط.');
          return;
        }
        if (!ctx.isAdmin) {
          await ctx.reply('🔒 هذا الأمر للمشرفين فقط.');
          return;
        }
        await handler(ctx);
      }
    });
  };

  const toggle = (section, enabled) => async ctx => {
    await save(ctx, section, { enabled });
    await ctx.reply(
      `${enabled ? '🟢 تم تشغيل' : '🔴 تم إيقاف'} ${sectionLabel(section)}.\n` +
      '💾 تم حفظ الإعداد لهذه المجموعة فقط.'
    );
  };

  const setText = section => async ctx => {
    const value = getInput(ctx);
    if (!value) {
      await ctx.reply('اكتب النص بعد الأمر.\nمثال: .ترحيب_نص أهلًا {user} في {group}');
      return;
    }
    await save(ctx, section, { text: value });
    await ctx.reply(`✅ تم حفظ نص ${sectionLabel(section)}.`);
  };

  const setUrl = (section, field, label) => async ctx => {
    const value = getInput(ctx);
    if (!/^https?:\/\/\S+$/i.test(value)) {
      await ctx.reply(`أرسل رابطًا مباشرًا يبدأ بـ https:// بعد الأمر لضبط ${label}.`);
      return;
    }
    await save(ctx, section, { [field]: value });
    await ctx.reply(`✅ تم حفظ رابط ${label}.`);
  };

  const clearField = (section, field, label) => async ctx => {
    await save(ctx, section, { [field]: '' });
    await ctx.reply(`🗑️ تم حذف ${label}.`);
  };

  const setBoolean = (section, field, value, label) => async ctx => {
    await save(ctx, section, { [field]: value });
    await ctx.reply(`${value ? '🟢' : '🔴'} ${label}: ${value ? 'مفعل' : 'متوقف'}.`);
  };

  const preview = section => async ctx => {
    const settings = await ctx.settingsStore.get(ctx.jid);
    const data = settings.marasem?.[section] || DEFAULTS[section];
    let metadata;
    try {
      metadata = await ctx.sock.groupMetadata(ctx.jid);
    } catch {}
    const user = ctx.senderJid || ctx.senderAltJid || '';
    const text = render(data.text, user, metadata?.subject, metadata?.participants?.length);
    const caption = `${data.title}\n\n${text}\n\n${data.footer}`;
    const mentions = data.mention && user ? [user] : [];

    if (data.image) {
      await ctx.sock.sendMessage(ctx.jid, {
        image: { url: data.image },
        caption,
        mentions
      });
    } else if (data.video) {
      await ctx.sock.sendMessage(ctx.jid, {
        video: { url: data.video },
        caption,
        mentions
      });
    } else {
      await ctx.reply(caption, { mentions });
    }
  };

  // 10 أوامر الترحيب
  add('تشغيل_الترحيب', 'تشغيل رسائل الترحيب', toggle('welcome', true));
  add('إيقاف_الترحيب', 'إيقاف رسائل الترحيب', toggle('welcome', false));
  add('ترحيب_نص', 'تغيير نص الترحيب', setText('welcome'));
  add('ترحيب_افتراضي', 'استعادة نص الترحيب الافتراضي', async ctx => {
    await save(ctx, 'welcome', { text: DEFAULTS.welcome.text });
    await ctx.reply('✅ تمت استعادة نص الترحيب الافتراضي.');
  });
  add('ترحيب_صورة', 'ضبط صورة الترحيب برابط', setUrl('welcome', 'image', 'صورة الترحيب'));
  add('حذف_صورة_الترحيب', 'حذف صورة الترحيب', clearField('welcome', 'image', 'صورة الترحيب'));
  add('ترحيب_فيديو', 'ضبط فيديو الترحيب برابط', setUrl('welcome', 'video', 'فيديو الترحيب'));
  add('حذف_فيديو_الترحيب', 'حذف فيديو الترحيب', clearField('welcome', 'video', 'فيديو الترحيب'));
  add('منشن_الترحيب', 'تفعيل منشن الترحيب', setBoolean('welcome', 'mention', true, 'منشن الترحيب'));
  add('إيقاف_منشن_الترحيب', 'إيقاف منشن الترحيب', setBoolean('welcome', 'mention', false, 'منشن الترحيب'));

  // 10 أوامر الوداع
  add('تشغيل_الوداع', 'تشغيل رسائل الوداع', toggle('goodbye', true));
  add('إيقاف_الوداع', 'إيقاف رسائل الوداع', toggle('goodbye', false));
  add('وداع_نص', 'تغيير نص الوداع', setText('goodbye'));
  add('وداع_افتراضي', 'استعادة نص الوداع الافتراضي', async ctx => {
    await save(ctx, 'goodbye', { text: DEFAULTS.goodbye.text });
    await ctx.reply('✅ تمت استعادة نص الوداع الافتراضي.');
  });
  add('وداع_صورة', 'ضبط صورة الوداع برابط', setUrl('goodbye', 'image', 'صورة الوداع'));
  add('حذف_صورة_الوداع', 'حذف صورة الوداع', clearField('goodbye', 'image', 'صورة الوداع'));
  add('وداع_فيديو', 'ضبط فيديو الوداع برابط', setUrl('goodbye', 'video', 'فيديو الوداع'));
  add('حذف_فيديو_الوداع', 'حذف فيديو الوداع', clearField('goodbye', 'video', 'فيديو الوداع'));
  add('منشن_الوداع', 'تفعيل منشن الوداع', setBoolean('goodbye', 'mention', true, 'منشن الوداع'));
  add('إيقاف_منشن_الوداع', 'إيقاف منشن الوداع', setBoolean('goodbye', 'mention', false, 'منشن الوداع'));

  // 8 أوامر التصميم والنص
  add('عنوان_الترحيب', 'تغيير عنوان الترحيب', async ctx => {
    const value = getInput(ctx);
    if (!value) return ctx.reply('اكتب العنوان بعد الأمر.');
    await save(ctx, 'welcome', { title: value });
    await ctx.reply('✅ تم تغيير عنوان الترحيب.');
  });
  add('عنوان_الوداع', 'تغيير عنوان الوداع', async ctx => {
    const value = getInput(ctx);
    if (!value) return ctx.reply('اكتب العنوان بعد الأمر.');
    await save(ctx, 'goodbye', { title: value });
    await ctx.reply('✅ تم تغيير عنوان الوداع.');
  });
  add('تذييل_الترحيب', 'تغيير تذييل الترحيب', async ctx => {
    const value = getInput(ctx);
    if (!value) return ctx.reply('اكتب التذييل بعد الأمر.');
    await save(ctx, 'welcome', { footer: value });
    await ctx.reply('✅ تم تغيير تذييل الترحيب.');
  });
  add('تذييل_الوداع', 'تغيير تذييل الوداع', async ctx => {
    const value = getInput(ctx);
    if (!value) return ctx.reply('اكتب التذييل بعد الأمر.');
    await save(ctx, 'goodbye', { footer: value });
    await ctx.reply('✅ تم تغيير تذييل الوداع.');
  });
  add('قالب_الترحيب', 'عرض قالب الترحيب ومتغيراته', async ctx => {
    await ctx.reply('قالب الترحيب:\n' + DEFAULTS.welcome.text +
      '\n\nالمتغيرات: {user} اسم العضو، {group} اسم المجموعة، {count} عدد الأعضاء.');
  });
  add('قالب_الوداع', 'عرض قالب الوداع ومتغيراته', async ctx => {
    await ctx.reply('قالب الوداع:\n' + DEFAULTS.goodbye.text +
      '\n\nالمتغيرات: {user} اسم العضو، {group} اسم المجموعة، {count} عدد الأعضاء.');
  });
  add('معاينة_الترحيب', 'معاينة الترحيب', preview('welcome'));
  add('معاينة_الوداع', 'معاينة الوداع', preview('goodbye'));

  // 7 أوامر إعدادات الوسائط
  add('حالة_وسائط_الترحيب', 'عرض إعدادات وسائط الترحيب', async ctx => {
    const s = (await ctx.settingsStore.get(ctx.jid)).marasem?.welcome || DEFAULTS.welcome;
    await ctx.reply(`صورة: ${s.image ? 'مضبوطة' : 'غير مضبوطة'}\nفيديو: ${s.video ? 'مضبوط' : 'غير مضبوط'}`);
  });
  add('حالة_وسائط_الوداع', 'عرض إعدادات وسائط الوداع', async ctx => {
    const s = (await ctx.settingsStore.get(ctx.jid)).marasem?.goodbye || DEFAULTS.goodbye;
    await ctx.reply(`صورة: ${s.image ? 'مضبوطة' : 'غير مضبوطة'}\nفيديو: ${s.video ? 'مضبوط' : 'غير مضبوط'}`);
  });
  add('إزالة_وسائط_الترحيب', 'حذف صورة وفيديو الترحيب', async ctx => {
    await save(ctx, 'welcome', { image: '', video: '' });
    await ctx.reply('🗑️ تم حذف وسائط الترحيب.');
  });
  add('إزالة_وسائط_الوداع', 'حذف صورة وفيديو الوداع', async ctx => {
    await save(ctx, 'goodbye', { image: '', video: '' });
    await ctx.reply('🗑️ تم حذف وسائط الوداع.');
  });
  add('تبديل_وسائط_الترحيب', 'التبديل بين صورة وفيديو الترحيب', async ctx => {
    const s = (await ctx.settingsStore.get(ctx.jid)).marasem?.welcome || DEFAULTS.welcome;
    if (s.video) await save(ctx, 'welcome', { image: '' });
    else if (s.image) await save(ctx, 'welcome', { video: '' });
    else return ctx.reply('لا توجد صورة أو فيديو مضبوط.');
    await ctx.reply('✅ تم إزالة الوسيط الآخر. الصورة والفيديو لا يعملان معًا.');
  });
  add('تبديل_وسائط_الوداع', 'التبديل بين صورة وفيديو الوداع', async ctx => {
    const s = (await ctx.settingsStore.get(ctx.jid)).marasem?.goodbye || DEFAULTS.goodbye;
    if (s.video) await save(ctx, 'goodbye', { image: '' });
    else if (s.image) await save(ctx, 'goodbye', { video: '' });
    else return ctx.reply('لا توجد صورة أو فيديو مضبوط.');
    await ctx.reply('✅ تم إزالة الوسيط الآخر.');
  });
  add('معاينة_وسائط_الترحيب', 'معاينة وسائط الترحيب', preview('welcome'));
  add('معاينة_وسائط_الوداع', 'معاينة وسائط الوداع', preview('goodbye'));

  // 10 أوامر الحالة والإدارة
  add('حالة_المراسم', 'عرض حالة الترحيب والوداع', async ctx => {
    const s = (await ctx.settingsStore.get(ctx.jid)).marasem || {};
    await ctx.reply(
      '╭━━〔 ❄️ ALVARIA MARASEM 〕━━╮\n' +
      `الترحيب: ${s.welcome?.enabled ? '🟢 يعمل' : '🔴 متوقف'}\n` +
      `الوداع: ${s.goodbye?.enabled ? '🟢 يعمل' : '🔴 متوقف'}\n` +
      '╰━━〔 الإعدادات محفوظة 〕━━╯'
    );
  });
  // ❄️ ALVARIA MARASEM INTERACTIVE CENTER
  const sendMarasemMenu = async (ctx, menuKey) => {
    const menus = {
      main: {
        title: '❄️ مركز مراسم ALVARIA',
        subtitle: 'WELCOME • GOODBYE • DESIGN',
        sections: [{
          title: '❅ أقسام المراسم',
          rows: [
            ['🌸 إعدادات الترحيب', 'تشغيل الترحيب وتخصيص رسائله', '.مراسم_الترحيب'],
            ['👋 إعدادات الوداع', 'التحكم في رسائل مغادرة الأعضاء', '.مراسم_الوداع'],
            ['🎨 التصميم والنصوص', 'العناوين والتذييلات والقوالب', '.مراسم_التصميم'],
            ['🖼️ الوسائط', 'الصور والفيديو وإعداداتها', '.مراسم_الوسائط'],
            ['👁️ المعاينة', 'مشاهدة رسائل الترحيب والوداع', '.مراسم_المعاينة'],
            ['⚙️ الحالة والإدارة', 'الإعدادات الحالية وإعادة الضبط', '.مراسم_الإدارة']
          ]
        }]
      },
      welcome: {
        title: '🌸 مركز الترحيب',
        subtitle: 'WELCOME SETTINGS',
        sections: [{
          title: '❅ أوامر الترحيب',
          rows: [
            ['🟢 تشغيل الترحيب', 'تفعيل رسالة دخول الأعضاء', '.تشغيل_الترحيب'],
            ['🔴 إيقاف الترحيب', 'إيقاف رسالة دخول الأعضاء', '.إيقاف_الترحيب'],
            ['✏️ تغيير النص', 'تخصيص رسالة الترحيب', '.ترحيب_نص'],
            ['🔄 النص الافتراضي', 'استعادة نص الترحيب الأصلي', '.ترحيب_افتراضي'],
            ['🖼️ ضبط الصورة', 'تعيين صورة الترحيب برابط مباشر', '.ترحيب_صورة'],
            ['🗑️ حذف الصورة', 'إزالة صورة الترحيب', '.حذف_صورة_الترحيب'],
            ['🎥 ضبط الفيديو', 'تعيين فيديو الترحيب برابط مباشر', '.ترحيب_فيديو'],
            ['🗑️ حذف الفيديو', 'إزالة فيديو الترحيب', '.حذف_فيديو_الترحيب'],
            ['📣 تفعيل المنشن', 'منشن العضو عند الترحيب', '.منشن_الترحيب'],
            ['🔕 إيقاف المنشن', 'إلغاء منشن العضو', '.إيقاف_منشن_الترحيب']
          ]
        }]
      },
      goodbye: {
        title: '👋 مركز الوداع',
        subtitle: 'GOODBYE SETTINGS',
        sections: [{
          title: '❅ أوامر الوداع',
          rows: [
            ['🟢 تشغيل الوداع', 'تفعيل رسالة مغادرة الأعضاء', '.تشغيل_الوداع'],
            ['🔴 إيقاف الوداع', 'إيقاف رسالة المغادرة', '.إيقاف_الوداع'],
            ['✏️ تغيير النص', 'تخصيص رسالة الوداع', '.وداع_نص'],
            ['🔄 النص الافتراضي', 'استعادة نص الوداع الأصلي', '.وداع_افتراضي'],
            ['🖼️ ضبط الصورة', 'تعيين صورة الوداع برابط مباشر', '.وداع_صورة'],
            ['🗑️ حذف الصورة', 'إزالة صورة الوداع', '.حذف_صورة_الوداع'],
            ['🎥 ضبط الفيديو', 'تعيين فيديو الوداع برابط مباشر', '.وداع_فيديو'],
            ['🗑️ حذف الفيديو', 'إزالة فيديو الوداع', '.حذف_فيديو_الوداع'],
            ['📣 تفعيل المنشن', 'منشن العضو عند المغادرة', '.منشن_الوداع'],
            ['🔕 إيقاف المنشن', 'إلغاء منشن العضو', '.إيقاف_منشن_الوداع']
          ]
        }]
      },
      design: {
        title: '🎨 استوديو التصميم',
        subtitle: 'TEXT • TITLES • TEMPLATES',
        sections: [{
          title: '❅ تخصيص الرسائل',
          rows: [
            ['🏷️ عنوان الترحيب', 'تغيير عنوان رسالة الترحيب', '.عنوان_الترحيب'],
            ['🏷️ عنوان الوداع', 'تغيير عنوان رسالة الوداع', '.عنوان_الوداع'],
            ['📝 تذييل الترحيب', 'تغيير النص أسفل الترحيب', '.تذييل_الترحيب'],
            ['📝 تذييل الوداع', 'تغيير النص أسفل الوداع', '.تذييل_الوداع'],
            ['📄 قالب الترحيب', 'عرض قالب الترحيب والمتغيرات', '.قالب_الترحيب'],
            ['📄 قالب الوداع', 'عرض قالب الوداع والمتغيرات', '.قالب_الوداع'],
            ['🔤 متغيرات الترحيب', 'شرح المتغيرات المتاحة', '.متغيرات_الترحيب'],
            ['🔤 متغيرات الوداع', 'شرح المتغيرات المتاحة', '.متغيرات_الوداع']
          ]
        }]
      },
      media: {
        title: '🖼️ استوديو الوسائط',
        subtitle: 'IMAGES • VIDEOS • MEDIA',
        sections: [{
          title: '❅ إدارة الوسائط',
          rows: [
            ['🖼️ صورة الترحيب', 'ضبط صورة الترحيب', '.ترحيب_صورة'],
            ['🎥 فيديو الترحيب', 'ضبط فيديو الترحيب', '.ترحيب_فيديو'],
            ['🖼️ صورة الوداع', 'ضبط صورة الوداع', '.وداع_صورة'],
            ['🎥 فيديو الوداع', 'ضبط فيديو الوداع', '.وداع_فيديو'],
            ['📊 وسائط الترحيب', 'معرفة حالة صورة وفيديو الترحيب', '.حالة_وسائط_الترحيب'],
            ['📊 وسائط الوداع', 'معرفة حالة صورة وفيديو الوداع', '.حالة_وسائط_الوداع'],
            ['🗑️ إزالة وسائط الترحيب', 'حذف الصورة والفيديو', '.إزالة_وسائط_الترحيب'],
            ['🗑️ إزالة وسائط الوداع', 'حذف الصورة والفيديو', '.إزالة_وسائط_الوداع'],
            ['🔄 تبديل وسائط الترحيب', 'التبديل بين الصورة والفيديو', '.تبديل_وسائط_الترحيب'],
            ['🔄 تبديل وسائط الوداع', 'التبديل بين الصورة والفيديو', '.تبديل_وسائط_الوداع']
          ]
        }]
      },
      preview: {
        title: '👁️ معاينة المراسم',
        subtitle: 'PREVIEW CENTER',
        sections: [{
          title: '❅ اختر المعاينة',
          rows: [
            ['🌸 معاينة الترحيب', 'عرض رسالة الترحيب الحالية', '.معاينة_الترحيب'],
            ['👋 معاينة الوداع', 'عرض رسالة الوداع الحالية', '.معاينة_الوداع'],
            ['🖼️ معاينة وسائط الترحيب', 'عرض الترحيب بالوسائط المضبوطة', '.معاينة_وسائط_الترحيب'],
            ['🖼️ معاينة وسائط الوداع', 'عرض الوداع بالوسائط المضبوطة', '.معاينة_وسائط_الوداع']
          ]
        }]
      },
      admin: {
        title: '⚙️ إدارة المراسم',
        subtitle: 'STATUS • SETTINGS • RESET',
        sections: [{
          title: '❅ الحالة والإعدادات',
          rows: [
            ['📊 حالة المراسم', 'معرفة حالة الترحيب والوداع', '.حالة_المراسم'],
            ['🌸 إعدادات الترحيب', 'عرض جميع إعدادات الترحيب', '.إعدادات_الترحيب'],
            ['👋 إعدادات الوداع', 'عرض جميع إعدادات الوداع', '.إعدادات_الوداع'],
            ['📋 نسخ نص الترحيب', 'عرض النص المحفوظ حاليًا', '.نسخ_نص_الترحيب'],
            ['📋 نسخ نص الوداع', 'عرض النص المحفوظ حاليًا', '.نسخ_نص_الوداع'],
            ['♻️ إعادة ضبط الترحيب', 'استعادة إعدادات الترحيب الافتراضية', '.إعادة_ضبط_الترحيب'],
            ['♻️ إعادة ضبط الوداع', 'استعادة إعدادات الوداع الافتراضية', '.إعادة_ضبط_الوداع']
          ]
        }]
      }
    };

    const menu = menus[menuKey];
    if (!menu) {
      await ctx.reply('❌ هذه القائمة غير متاحة.');
      return;
    }

    const { sendHinataNativeButtons } =
      await import('./native-buttons.js');

    let imageBuffer = null;
    try {
      const { getSubbotSectionImage } =
        await import('./subbot-section-images.js');
      imageBuffer = await getSubbotSectionImage(ctx, 'المراسم');
    } catch (error) {
      console.error('[ALVARIA MARASEM IMAGE ERROR]', error);
    }

    const rows = menu.sections.flatMap(section =>
      section.rows.map(([title, description, id]) => ({
        title: String(title).slice(0, 24),
        description: String(description).slice(0, 72),
        id
      }))
    );

    if (menuKey !== 'main') {
      rows.push({
        title: '⬅️ العودة إلى مراسم ALVARIA',
        description: 'الرجوع إلى القائمة الرئيسية',
        id: '.مراسم'
      });
    }

    const guideRows = menu.sections.flatMap(section => [
      `*❅ ${section.title}*`,
      ...section.rows.flatMap(([title, description, id]) => [
        `*•┆❄️〖 ${id} 〗*`,
        `⟞ ${description}`,
        ''
      ])
    ]);

    const text = [
      '*╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮*',
      '',
      '*❅ مَـرْكَـزُ الـمَـرَاسِـم*',
      '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑾𝑬𝑳𝑪𝑶𝑴𝑬 & 𝑮𝑶𝑶𝑫𝑩𝒀𝑬 』*',
      '',
      '*' + menu.title + '*',
      '_' + menu.subtitle + '_',
      '',
      '*❅ دَلِـيـلُ أَوَامِـرِ القِـسْـم ❅*',
      ...guideRows,
      '_❃ جميع الإعدادات خاصة بهذه المجموعة فقط ❃_',
      '_اختر العملية التي تريد تنفيذها من القائمة التفاعلية._',
      '',
      '*╰━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╯*'
    ].join('\n');

    await sendHinataNativeButtons(ctx.sock, ctx.jid, {
      imageBuffer,
      text,
      title: '❄️ ALVARIA • MARASEM',
      footer: '❅ WELCOME & GOODBYE • ALVARIA',
      buttons: [{
        type: 'single_select',
        title: '❄️ فتح قائمة المراسم',
        sections: menu.sections.map(section => ({
          title: section.title,
          rows: section.rows.map(([title, description, id]) => ({
            title: String(title).slice(0, 24),
            description: String(description).slice(0, 72),
            id
          }))
        })).concat(menuKey === 'main' ? [] : [{
          title: '❅ التنقل',
          rows: [{
            title: '⬅️ القائمة الرئيسية',
            description: 'العودة إلى مركز المراسم',
            id: '.مراسم'
          }]
        }])
      }]
    });
  };

  add('مراسم', 'عرض دليل ALVARIA الكامل لجميع أوامر المراسم', async ctx => {
    const groups = [
      {
        title: '🌸 أوامر الترحيب',
        commands: [
          'تشغيل_الترحيب',
          'إيقاف_الترحيب',
          'ترحيب_نص',
          'ترحيب_افتراضي',
          'ترحيب_صورة',
          'حذف_صورة_الترحيب',
          'ترحيب_فيديو',
          'حذف_فيديو_الترحيب',
          'منشن_الترحيب',
          'إيقاف_منشن_الترحيب'
        ]
      },
      {
        title: '👋 أوامر الوداع',
        commands: [
          'تشغيل_الوداع',
          'إيقاف_الوداع',
          'وداع_نص',
          'وداع_افتراضي',
          'وداع_صورة',
          'حذف_صورة_الوداع',
          'وداع_فيديو',
          'حذف_فيديو_الوداع',
          'منشن_الوداع',
          'إيقاف_منشن_الوداع'
        ]
      },
      {
        title: '🎨 التصميم والنصوص والقوالب',
        commands: [
          'عنوان_الترحيب',
          'عنوان_الوداع',
          'تذييل_الترحيب',
          'تذييل_الوداع',
          'قالب_الترحيب',
          'قالب_الوداع',
          'متغيرات_الترحيب',
          'متغيرات_الوداع'
        ]
      },
      {
        title: '🖼️ إدارة الوسائط',
        commands: [
          'حالة_وسائط_الترحيب',
          'حالة_وسائط_الوداع',
          'إزالة_وسائط_الترحيب',
          'إزالة_وسائط_الوداع',
          'تبديل_وسائط_الترحيب',
          'تبديل_وسائط_الوداع'
        ]
      },
      {
        title: '👁️ المعاينة',
        commands: [
          'معاينة_الترحيب',
          'معاينة_الوداع',
          'معاينة_وسائط_الترحيب',
          'معاينة_وسائط_الوداع'
        ]
      },
      {
        title: '⚙️ الحالة والإدارة والإعدادات',
        commands: [
          'حالة_المراسم',
          'إعدادات_الترحيب',
          'إعدادات_الوداع',
          'نسخ_نص_الترحيب',
          'نسخ_نص_الوداع',
          'إعادة_ضبط_الترحيب',
          'إعادة_ضبط_الوداع'
        ]
      }
    ];

    const guide = [
      '*╭━━━━━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━━━━━╮*',
      '',
      '*🍹 مَـرْكَـزُ الـمَـرَاسِـم*',
      '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑾𝑬𝑳𝑪𝑶𝑴𝑬 & 𝑮𝑶𝑶𝑫𝑩𝒀𝑬 』*',
      '',
      '*❅ الدليل الكامل لجميع أوامر المراسم ❅*',
      '',
      ...groups.flatMap(group => [
        `*${group.title}*`,
        '',
        ...group.commands.flatMap(name => {
          const description =
            commands.get(name)?.description || 'تنفيذ إعداد المراسم المرتبط بهذا الأمر.';
          return [
            `*•┆❄️〖 .${name} 〗*`,
            `⟞ ${description}`,
            ''
          ];
        })
      ]),
      '*❅ متغيرات النصوص ❅*',
      '• {user} : اسم العضو.',
      '• {group} : اسم المجموعة.',
      '• {count} : عدد أعضاء المجموعة.',
      '',
      '*❅ ملاحظات مهمة ❅*',
      '• إعدادات المراسم محفوظة لكل مجموعة بشكل مستقل.',
      '• أوامر إعداد المراسم مخصصة لمشرفي المجموعة.',
      '• عند كتابة نص أو رابط، ضعه بعد الأمر مباشرة.',
      '• استخدم أوامر المعاينة لمشاهدة النتيجة.',
      '',
      '*╰━━━━━━〔 ❄️ ALVARIA • MARASEM 〕━━━━━━╯*'
    ].join('\n');

    const { sendHinataNativeButtons } =
      await import('./native-buttons.js');

    await sendHinataNativeButtons(ctx.sock, ctx.jid, {
      text: guide,
      title: '❄️ ALVARIA • MARASEM',
      footer: '❅ WELCOME & GOODBYE • ALVARIA',
      buttons: [{
        type: 'single_select',
        title: '❄️ التنقل',
        sections: [{
          title: '❅ القائمة الرئيسية',
          rows: [{
            title: '⬅️ العودة إلى القائمة الرئيسية',
            description: 'الرجوع إلى قائمة أوامر البوت',
            id: '.اوامر'
          }]
        }]
      }]
    });
  });

  add('مراسم_الترحيب', 'فتح إعدادات الترحيب', async ctx => {
    await sendMarasemMenu(ctx, 'welcome');
  });

  add('مراسم_الوداع', 'فتح إعدادات الوداع', async ctx => {
    await sendMarasemMenu(ctx, 'goodbye');
  });

  add('مراسم_التصميم', 'فتح استوديو تصميم المراسم', async ctx => {
    await sendMarasemMenu(ctx, 'design');
  });

  add('مراسم_الوسائط', 'فتح إدارة وسائط المراسم', async ctx => {
    await sendMarasemMenu(ctx, 'media');
  });

  add('مراسم_المعاينة', 'فتح معاينة المراسم', async ctx => {
    await sendMarasemMenu(ctx, 'preview');
  });

  add('مراسم_الإدارة', 'فتح حالة وإدارة المراسم', async ctx => {
    await sendMarasemMenu(ctx, 'admin');
  });
  add('إعادة_ضبط_الترحيب', 'إعادة إعدادات الترحيب الافتراضية', async ctx => {
    await save(ctx, 'welcome', { ...DEFAULTS.welcome });
    await ctx.reply('✅ تمت إعادة إعدادات الترحيب، وهو متوقف افتراضيًا.');
  });
  add('إعادة_ضبط_الوداع', 'إعادة إعدادات الوداع الافتراضية', async ctx => {
    await save(ctx, 'goodbye', { ...DEFAULTS.goodbye });
    await ctx.reply('✅ تمت إعادة إعدادات الوداع، وهو متوقف افتراضيًا.');
  });
  add('متغيرات_الترحيب', 'شرح متغيرات الترحيب', async ctx => {
    await ctx.reply('{user} اسم العضو\n{group} اسم المجموعة\n{count} عدد الأعضاء');
  });
  add('متغيرات_الوداع', 'شرح متغيرات الوداع', async ctx => {
    await ctx.reply('{user} اسم العضو\n{group} اسم المجموعة\n{count} عدد الأعضاء');
  });
  add('نسخ_نص_الترحيب', 'عرض نص الترحيب الحالي', async ctx => {
    const s = (await ctx.settingsStore.get(ctx.jid)).marasem?.welcome || DEFAULTS.welcome;
    await ctx.reply(s.text);
  });
  add('نسخ_نص_الوداع', 'عرض نص الوداع الحالي', async ctx => {
    const s = (await ctx.settingsStore.get(ctx.jid)).marasem?.goodbye || DEFAULTS.goodbye;
    await ctx.reply(s.text);
  });
  add('إعدادات_الترحيب', 'عرض إعدادات الترحيب', async ctx => {
    const s = (await ctx.settingsStore.get(ctx.jid)).marasem?.welcome || DEFAULTS.welcome;
    await ctx.reply(`التشغيل: ${s.enabled ? 'نعم' : 'لا'}\nالمنشن: ${s.mention ? 'نعم' : 'لا'}\nالصورة: ${s.image ? 'مضبوطة' : 'لا'}\nالفيديو: ${s.video ? 'مضبوط' : 'لا'}`);
  });
  add('إعدادات_الوداع', 'عرض إعدادات الوداع', async ctx => {
    const s = (await ctx.settingsStore.get(ctx.jid)).marasem?.goodbye || DEFAULTS.goodbye;
    await ctx.reply(`التشغيل: ${s.enabled ? 'نعم' : 'لا'}\nالمنشن: ${s.mention ? 'نعم' : 'لا'}\nالصورة: ${s.image ? 'مضبوطة' : 'لا'}\nالفيديو: ${s.video ? 'مضبوط' : 'لا'}`);
  });
}

export async function handleMarasemParticipantUpdate(sock, update, settingsStore, logger) {
  if (!update?.id || !Array.isArray(update.participants)) return;
  if (!['add', 'remove'].includes(update.action)) return;

  const section = update.action === 'add' ? 'welcome' : 'goodbye';
  const settings = await settingsStore.get(update.id);
  const data = settings.marasem?.[section] || DEFAULTS[section];
  if (data.enabled !== true) return;

  let metadata;
  try {
    metadata = await sock.groupMetadata(update.id);
  } catch (error) {
    logger?.warn?.({ err: error }, 'Could not read group metadata for Marasem');
  }

  for (const participant of update.participants) {
    try {
      const user = typeof participant === 'string' ? participant : participant?.id;
      if (!user || !user.includes('@')) continue;

      const text = render(data.text, user, metadata?.subject, metadata?.participants?.length);
      const caption = `${data.title}\n\n${text}\n\n${data.footer}`;
      const mentions = data.mention ? [user] : [];

      if (data.image) {
        await sock.sendMessage(update.id, {
          image: { url: data.image },
          caption,
          mentions
        });
      } else if (data.video) {
        await sock.sendMessage(update.id, {
          video: { url: data.video },
          caption,
          mentions
        });
      } else {
        await sock.sendMessage(update.id, { text: caption, mentions });
      }
    } catch (error) {
      logger?.warn?.({ err: error, group: update.id }, 'Marasem message failed');
    }
  }
}
