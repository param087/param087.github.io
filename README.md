# Param Bhavsar - Portfolio Website

A modern, responsive portfolio website showcasing the work and experience of Param Bhavsar, a Lead Software Engineer with 5+ years of experience.

## 🌟 Features

- **Responsive Design**: Fully responsive layout that works seamlessly on desktop, tablet, and mobile devices
- **Modern UI**: Clean and professional design using Tailwind CSS
- **Interactive Elements**: Smooth scrolling, animated sections, and interactive project cards
- **Multiple Sections**:
  - Landing/Hero section with professional introduction
  - About Me section highlighting experience and background
  - Resume section with downloadable PDF and detailed work history
  - Projects showcase with 6 featured projects
  - Research & Publications section
  - Skills & Technologies grid
  - Contact form with validation
  - Professional footer

## 🚀 Quick Start

### Local Development

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/Porfolio.git
   cd Porfolio
   ```

2. Open `index.html` in your browser:
   ```bash
   # On macOS
   open index.html
   
   # On Linux
   xdg-open index.html
   
   # On Windows
   start index.html
   ```

3. That's it! No build process or dependencies required.

### Using a Local Server (Optional)

For a better development experience, you can use a local server:

```bash
# Using Python 3
python -m http.server 8000

# Using Python 2
python -m SimpleHTTPServer 8000

# Using Node.js (http-server)
npx http-server

# Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## 📦 Deployment to GitHub Pages

### Method 1: Direct Deployment (Recommended)

1. **Create a GitHub repository**:
   - Go to [GitHub](https://github.com) and create a new repository
   - Name it `yourusername.github.io` (for user page) or any name (for project page)

2. **Push your code**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/repository-name.git
   git push -u origin main
   ```

3. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Click on **Settings** > **Pages**
   - Under "Source", select **main** branch
   - Select **/ (root)** folder
   - Click **Save**

4. **Access your site**:
   - Your site will be available at: `https://yourusername.github.io/repository-name/`
   - For user pages: `https://yourusername.github.io/`

### Method 2: Using GitHub Desktop

1. Download and install [GitHub Desktop](https://desktop.github.com/)
2. Create a new repository and add your files
3. Publish to GitHub
4. Follow steps 3-4 from Method 1

## 📝 Customization Guide

### 1. Personal Information

Edit `index.html` and update:
- Name and title in the hero section
- About Me description
- Work experience details
- Education information
- Contact information (email, phone)
- Social media links

**Find and replace**:
```html
<!-- Update these sections -->
<h1>Hi, I'm <span class="gradient-text">Param Bhavsar</span></h1>
<p>Software Engineer with 4+ Years of Experience</p>
<a href="mailto:param@example.com">
<a href="https://github.com/parambhavsar">
<a href="https://linkedin.com/in/parambhavsar">
```

### 2. Projects

Update project cards in the Projects section:
```html
<div class="bg-white rounded-lg shadow-md overflow-hidden hover-lift">
    <div class="h-48 bg-gradient-to-br from-blue-400 to-blue-600">
        <!-- Update icon -->
    </div>
    <div class="p-6">
        <h3>Your Project Name</h3>
        <p>Your project description</p>
        <!-- Update technologies and links -->
    </div>
</div>
```

### 3. Skills

Add or remove skills in the Skills section:
```html
<span class="px-3 py-1 bg-blue-100 text-blue-600 rounded-full text-sm">Your Skill</span>
```

### 4. Colors

Customize the color scheme by editing the Tailwind config in `index.html`:
```javascript
tailwind.config = {
    theme: {
        extend: {
            colors: {
                primary: '#2563eb',    // Change primary color
                secondary: '#1e40af',  // Change secondary color
                accent: '#3b82f6',     // Change accent color
            }
        }
    }
}
```

### 5. Resume PDF

1. Create or export your resume as a PDF file
2. Name it `resume.pdf`
3. Place it in the root directory (same level as `index.html`)
4. The download button will automatically work

**Alternative**: If you want a different filename:
```html
<!-- Change href in index.html -->
<a href="your-resume-name.pdf" download>Download Resume</a>
```

### 6. Profile Photo

To add your profile photo:
1. Add your image to `assets/images/` folder (create if doesn't exist)
2. Replace the icon in the hero section:

```html
<!-- Replace this -->
<div class="w-40 h-40 mx-auto rounded-full bg-gradient-to-br from-primary to-accent p-1">
    <div class="w-full h-full rounded-full bg-gray-200 flex items-center justify-center">
        <i class="fas fa-user text-6xl text-gray-400"></i>
    </div>
</div>

<!-- With this -->
<div class="w-40 h-40 mx-auto rounded-full bg-gradient-to-br from-primary to-accent p-1">
    <img src="assets/images/profile.jpg" alt="Param Bhavsar" 
         class="w-full h-full rounded-full object-cover">
</div>
```

## 🛠️ Technologies Used

- **HTML5**: Semantic markup
- **CSS3**: Custom styles and animations
- **Tailwind CSS**: Utility-first CSS framework (via CDN)
- **JavaScript**: Interactive features and animations
- **Font Awesome**: Icon library
- **Google Fonts**: Inter font family

## 📁 Project Structure

```
Porfolio/
├── index.html              # Main HTML file
├── resume.pdf              # Your resume (add this file)
├── README.md               # This file
└── assets/
    ├── js/
    │   └── main.js         # JavaScript functionality
    └── images/             # Add your images here (optional)
        └── profile.jpg     # Your profile photo (optional)
```

## 🔧 Advanced Customization

### Adding Google Analytics

Add before the closing `</head>` tag:
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### Adding Favicon

1. Generate a favicon at [favicon.io](https://favicon.io)
2. Add to your root directory
3. Add to `<head>` section:
```html
<link rel="icon" type="image/png" href="favicon.png">
```

### Custom Domain

1. Buy a domain from a registrar (GoDaddy, Namecheap, etc.)
2. Create a file named `CNAME` in root directory
3. Add your domain: `yourdomain.com`
4. Configure DNS settings at your registrar:
   - Add A records pointing to GitHub Pages IPs
   - Or add CNAME record pointing to `yourusername.github.io`

## 🐛 Troubleshooting

### Images not loading
- Ensure file paths are correct (case-sensitive on GitHub Pages)
- Use relative paths: `assets/images/photo.jpg`

### Styles not applying
- Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
- Check browser console for errors

### GitHub Pages not updating
- Changes may take 1-2 minutes to deploy
- Check GitHub Actions tab for build status
- Try hard refresh (Ctrl+F5)

## 📱 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

Feel free to fork this project and customize it for your own portfolio! If you create something cool, consider sharing it.

## 📧 Contact

For questions or feedback, reach out via:
- Email: param.bhavsar@example.com
- GitHub: [@parambhavsar](https://github.com/parambhavsar)
- LinkedIn: [Param Bhavsar](https://linkedin.com/in/parambhavsar)

## ⭐ Acknowledgments

- Design inspiration from modern portfolio trends
- Icons by [Font Awesome](https://fontawesome.com)
- CSS framework by [Tailwind CSS](https://tailwindcss.com)

---

**Built with ❤️ by Param Bhavsar**
